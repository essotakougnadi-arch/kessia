// ============================================================
// KESSIA — Opportunity Engine (cahier des charges §17)
//
// Détecte des opportunités CONCRÈTES à partir des données propres
// de l'utilisateur : tontines publiques adaptées, devis à relancer,
// clients à réactiver, réassorts rentables, palier de Score…
//
// Aucune donnée inventée : chaque opportunité cite un fait vérifiable
// (une tontine réelle, un devis réel, un client réel). Déterministe.
// ============================================================

import prisma from '@/lib/db/prisma';
import { computeKessiaScore } from '@/lib/score/score.service';
import { tontineTypeMeta } from '@/lib/tontine/type-meta';
import { serverT, serverNumber } from '@/lib/i18n/server';

const DAY = 86_400_000;

export type OpportunityCategory = 'TONTINE' | 'BUSINESS' | 'SCORE' | 'EPARGNE';

export type Opportunity = {
  id: string;
  category: OpportunityCategory;
  icon: string;
  title: string;
  rationale: string;
  /** montant estimé associé, quand il est pertinent (FCFA) */
  potential: number | null;
  actionLabel: string;
  actionUrl: string;
  priority: number;
};

export async function computeOpportunities(userId: string): Promise<Opportunity[]> {
  const now = Date.now();
  const out: Opportunity[] = [];
  const t = serverT();
  const n = serverNumber;

  const [user, myTontineIds, publicTontines, businesses, score] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { wallet: { select: { balance: true } } },
    }),
    prisma.tontineMember.findMany({ where: { userId }, select: { tontineId: true } }),
    prisma.tontine.findMany({
      where: { isPublic: true, status: 'PENDING' },
      select: {
        id: true, name: true, type: true, amount: true, frequency: true, maxMembers: true,
        _count: { select: { members: true } },
      },
      take: 20,
    }),
    prisma.business.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        id: true, name: true,
        products: { select: { id: true, name: true, price: true, cost: true, stock: true } },
        goals: { select: { id: true } },
        invoices: {
          where: { kind: 'QUOTE', status: { in: ['DRAFT', 'SENT'] }, convertedInvoiceId: null },
          select: { id: true, invoiceNumber: true, customerName: true, total: true },
        },
        customers: {
          select: {
            id: true, name: true, type: true, nextFollowUpAt: true,
            sales: { select: { totalAmount: true, createdAt: true } },
          },
        },
      },
    }),
    computeKessiaScore(userId),
  ]);

  const balance = Number(user?.wallet?.balance ?? 0);
  const mine = new Set(myTontineIds.map((m) => m.tontineId));

  // ── Tontines publiques adaptées ────────────────────────────
  const affordable = publicTontines
    .filter((t) => !mine.has(t.id) && t._count.members < t.maxMembers)
    .filter((t) => balance === 0 || Number(t.amount) <= balance * 1.5)
    .sort((a, b) => Number(a.amount) - Number(b.amount));
  for (const pt of affordable.slice(0, 2)) {
    const meta = tontineTypeMeta(pt.type);
    const pot = Number(pt.amount) * pt.maxMembers;
    out.push({
      id: `tontine-join-${pt.id}`,
      category: 'TONTINE',
      icon: meta.icon,
      title: t('srvOpps.tontineJoinTitle', { name: pt.name }),
      rationale: t('srvOpps.tontineJoinRationale', {
        type: t(`tontineType.${meta.key}.label`),
        amount: n(Number(pt.amount)),
        members: pt._count.members,
        max: pt.maxMembers,
        pot: n(pot),
      }),
      potential: pot,
      actionLabel: t('srvOpps.tontineJoinAction'),
      actionUrl: `/tontine/${pt.id}`,
      priority: 70,
    });
  }

  // ── Par entreprise ─────────────────────────────────────────
  for (const b of businesses) {
    // Devis à relancer
    const quoteValue = b.invoices.reduce((s, q) => s + Number(q.total), 0);
    if (b.invoices.length > 0) {
      out.push({
        id: `biz-${b.id}-quotes`,
        category: 'BUSINESS',
        icon: '📄',
        title: t('srvOpps.quotesTitle', { count: b.invoices.length, name: b.name }),
        rationale: t('srvOpps.quotesRationale', {
          value: n(quoteValue),
          names: b.invoices.map((q) => q.customerName ?? q.invoiceNumber).slice(0, 3).join(', '),
        }),
        potential: quoteValue,
        actionLabel: t('srvOpps.quotesAction'),
        actionUrl: `/business/${b.id}?tab=factures`,
        priority: 65,
      });
    }

    // Clients à réactiver (achats anciens, ou relance due)
    const dormant = b.customers
      .map((c) => {
        const total = c.sales.reduce((s, x) => s + Number(x.totalAmount), 0);
        const last = c.sales.reduce<number>((m, x) => Math.max(m, x.createdAt.getTime()), 0);
        return { name: c.name, orders: c.sales.length, total, last, followDue: c.nextFollowUpAt ? c.nextFollowUpAt.getTime() <= now : false };
      })
      .filter((c) => c.orders >= 1 && (c.followDue || (c.last > 0 && now - c.last > 45 * DAY)))
      .sort((a, b2) => b2.total - a.total);
    if (dormant.length > 0) {
      const topSpend = dormant.reduce((s, c) => s + c.total, 0);
      out.push({
        id: `biz-${b.id}-reactivate`,
        category: 'BUSINESS',
        icon: '🔁',
        title: t('srvOpps.reactivateTitle', { count: dormant.length, name: b.name }),
        rationale: t('srvOpps.reactivateRationale', {
          names: dormant.slice(0, 3).map((c) => c.name).join(', '),
          total: n(topSpend),
        }),
        potential: Math.round(topSpend / Math.max(1, dormant.reduce((s, c) => s + c.orders, 0))) * dormant.length,
        actionLabel: t('srvOpps.reactivateAction'),
        actionUrl: `/business/${b.id}?tab=clients`,
        priority: 55,
      });
    }

    // Réassort d'un produit rentable en stock faible
    const restock = b.products
      .filter((p) => p.stock > 0 && p.stock <= 5 && p.cost != null && Number(p.price) > Number(p.cost))
      .sort((a, c) => (Number(c.price) - Number(c.cost ?? 0)) - (Number(a.price) - Number(a.cost ?? 0)))[0];
    if (restock) {
      const unitMargin = Number(restock.price) - Number(restock.cost ?? 0);
      out.push({
        id: `biz-${b.id}-restock-${restock.id}`,
        category: 'BUSINESS',
        icon: '📦',
        title: t('srvOpps.restockTitle', { product: restock.name, name: b.name }),
        rationale: t('srvOpps.restockRationale', { stock: restock.stock, margin: n(unitMargin) }),
        potential: unitMargin * 20,
        actionLabel: t('srvOpps.restockAction'),
        actionUrl: `/business/${b.id}?tab=produits`,
        priority: 45,
      });
    }

    // Produit à marge trop faible
    const thin = b.products
      .filter((p) => p.cost != null && Number(p.cost) > 0 && (Number(p.price) - Number(p.cost)) / Number(p.price) < 0.12)
      .sort((a, c) => Number(c.price) - Number(a.price))[0];
    if (thin) {
      const rate = Math.round(((Number(thin.price) - Number(thin.cost ?? 0)) / Number(thin.price)) * 100);
      out.push({
        id: `biz-${b.id}-thin-${thin.id}`,
        category: 'BUSINESS',
        icon: '⚖️',
        title: t('srvOpps.thinTitle', { product: thin.name, name: b.name }),
        rationale: t('srvOpps.thinRationale', { rate, newPrice: n(Math.round(Number(thin.price) * 1.1)) }),
        potential: null,
        actionLabel: t('srvOpps.thinAction'),
        actionUrl: `/business/${b.id}?tab=produits`,
        priority: 40,
      });
    }

    if (b.goals.length === 0) {
      out.push({
        id: `biz-${b.id}-goal`,
        category: 'BUSINESS',
        icon: '🎯',
        title: t('srvOpps.goalTitle', { name: b.name }),
        rationale: t('srvOpps.goalRationale'),
        potential: null,
        actionLabel: t('srvOpps.goalAction'),
        actionUrl: `/business/${b.id}?tab=objectifs`,
        priority: 30,
      });
    }
  }

  // ── Palier de KESSIA Score ─────────────────────────────────
  if (score.advice.length > 0 && score.score < 850) {
    out.push({
      id: 'score-next',
      category: 'SCORE',
      icon: '📈',
      title: t('srvOpps.scoreTitle'),
      rationale: t('srvOpps.scoreRationale', { score: score.score, band: score.bandLabel, advice: score.advice[0] }),
      potential: null,
      actionLabel: t('srvOpps.scoreAction'),
      actionUrl: '/profile/score',
      priority: 35,
    });
  }

  // ── Épargne : proposer une simulation si peu d'opportunités ─
  if (out.length < 2) {
    out.push({
      id: 'simulate-savings',
      category: 'EPARGNE',
      icon: '🧮',
      title: t('srvOpps.simulateTitle'),
      rationale: t('srvOpps.simulateRationale'),
      potential: null,
      actionLabel: t('srvOpps.simulateAction'),
      actionUrl: '/simulator?sim=savings',
      priority: 15,
    });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 6);
}
