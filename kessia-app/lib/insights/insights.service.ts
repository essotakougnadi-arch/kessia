// ============================================================
// KESSIA — Smart Alerts / Insights (cahier des charges §5, §7, §22)
//
// Recommandations **dérivées de données réelles** de l'utilisateur.
// Aucune donnée financière inventée : chaque insight cite un fait
// vérifiable (solde, échéance, statut KYC, ventes…). Déterministe.
// ============================================================

import prisma from '@/lib/db/prisma';
import { computeKessiaScore } from '@/lib/score/score.service';
import { serverT, serverNumber } from '@/lib/i18n/server';

export type InsightKind = 'action' | 'warn' | 'tip' | 'celebrate';

export type Insight = {
  id: string;
  kind: InsightKind;
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  /** tri décroissant */
  priority: number;
};

const DAY = 86_400_000;

export async function computeInsights(userId: string): Promise<Insight[]> {
  const now = Date.now();
  const insights: Insight[] = [];
  const t = serverT();
  const n = serverNumber;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      kycStatus: true,
      twoFactorEnabled: true,
      createdAt: true,
      wallet: { select: { id: true, balance: true, currency: true } },
    },
  });
  if (!user) return [];

  const walletId = user.wallet?.id;
  const balance = Number(user.wallet?.balance ?? 0);

  const [memberships, recentDebits, businesses] = await Promise.all([
    prisma.tontineMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        id: true,
        tontine: { select: { id: true, name: true, status: true, amount: true, nextContributionDate: true, currentRound: true } },
      },
    }),
    walletId
      ? prisma.ledgerEntry.findMany({
          where: { walletId, direction: 'DEBIT', createdAt: { gte: new Date(now - 30 * DAY) } },
          select: { amount: true },
        })
      : Promise.resolve([]),
    prisma.business.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        _count: { select: { sales: true } },
        sales: { where: { createdAt: { gte: new Date(now - 7 * DAY) } }, select: { id: true } },
      },
    }),
  ]);

  // ── KYC ────────────────────────────────────────────────────
  if (user.kycStatus === 'ACTION_REQUIRED' || user.kycStatus === 'REJECTED') {
    insights.push({
      id: 'kyc-action', kind: 'warn', icon: '🛡️',
      title: t('srvInsights.kycActionTitle'),
      body: t('srvInsights.kycActionBody'),
      actionLabel: t('srvInsights.seeDetail'), actionUrl: '/profile/kyc', priority: 100,
    });
  } else if (user.kycStatus === 'NOT_STARTED' || user.kycStatus === 'IN_PROGRESS') {
    insights.push({
      id: 'kyc-start', kind: 'action', icon: '🛡️',
      title: t('srvInsights.kycStartTitle'),
      body: t('srvInsights.kycStartBody'),
      actionLabel: t('srvInsights.start'), actionUrl: '/profile/kyc', priority: 80,
    });
  }

  // ── Cotisations de tontine à venir / en retard ─────────────
  for (const m of memberships) {
    const tn = m.tontine;
    if (tn.status !== 'ACTIVE' || !tn.nextContributionDate) continue;
    const days = Math.ceil((new Date(tn.nextContributionDate).getTime() - now) / DAY);
    const amount = Number(tn.amount);
    const curLabel = cur(user.wallet?.currency);
    if (days < 0) {
      insights.push({
        id: `contrib-late-${tn.id}`, kind: 'warn', icon: '⏰',
        title: t('srvInsights.contribLateTitle', { name: tn.name }),
        body: t('srvInsights.contribLateBody', { amount: n(amount), cur: curLabel, round: tn.currentRound }),
        actionLabel: t('srvInsights.contribNow'), actionUrl: `/tontine/${tn.id}`, priority: 95,
      });
    } else if (days <= 3) {
      const short = balance < amount;
      insights.push({
        id: `contrib-soon-${tn.id}`, kind: short ? 'warn' : 'action', icon: '💳',
        title: days === 0
          ? t('srvInsights.contribSoonToday', { name: tn.name })
          : t('srvInsights.contribSoonDays', { name: tn.name, days }),
        body: short
          ? t('srvInsights.contribShortBody', { amount: n(amount), cur: curLabel, balance: n(balance) })
          : t('srvInsights.contribOkBody', { amount: n(amount), cur: curLabel, round: tn.currentRound }),
        actionLabel: short ? t('srvInsights.recharge') : t('srvInsights.contribute'),
        actionUrl: short ? '/wallet?action=deposit' : `/tontine/${tn.id}`,
        priority: short ? 90 : 60,
      });
    }
  }

  // ── Solde bas au regard des engagements ────────────────────
  const monthlyOutflow = recentDebits.reduce((s, e) => s + Number(e.amount), 0);
  if (balance > 0 && monthlyOutflow > 0 && balance < monthlyOutflow * 0.2) {
    insights.push({
      id: 'low-balance', kind: 'tip', icon: '📉',
      title: t('srvInsights.lowBalanceTitle'),
      body: t('srvInsights.lowBalanceBody', { spent: n(Math.round(monthlyOutflow)), cur: cur(user.wallet?.currency) }),
      actionLabel: t('srvInsights.recharge'), actionUrl: '/wallet?action=deposit', priority: 50,
    });
  }

  // ── Sécurité ───────────────────────────────────────────────
  if (!user.twoFactorEnabled) {
    insights.push({
      id: 'enable-2fa', kind: 'tip', icon: '🔒',
      title: t('srvInsights.twofaTitle'),
      body: t('srvInsights.twofaBody'),
      actionLabel: t('srvInsights.enable'), actionUrl: '/profile/security', priority: 40,
    });
  }

  // ── Business Advisor (déterministe, basé sur les ventes) ───
  for (const b of businesses) {
    if (b._count.sales === 0) {
      insights.push({
        id: `biz-nosales-${b.id}`, kind: 'tip', icon: '🏪',
        title: t('srvInsights.bizNoSalesTitle', { name: b.name }),
        body: t('srvInsights.bizNoSalesBody'),
        actionLabel: t('srvInsights.openBusiness'), actionUrl: `/business/${b.id}`, priority: 35,
      });
    } else if (b.sales.length === 0) {
      insights.push({
        id: `biz-quiet-${b.id}`, kind: 'tip', icon: '📊',
        title: t('srvInsights.bizQuietTitle', { name: b.name }),
        body: t('srvInsights.bizQuietBody'),
        actionLabel: t('srvInsights.seeStats'), actionUrl: `/business/${b.id}`, priority: 25,
      });
    } else if (b.sales.length >= 5) {
      insights.push({
        id: `biz-strong-${b.id}`, kind: 'celebrate', icon: '🎉',
        title: t('srvInsights.bizStrongTitle', { count: b.sales.length, name: b.name }),
        body: t('srvInsights.bizStrongBody'),
        actionLabel: t('srvInsights.seeStock'), actionUrl: `/business/${b.id}`, priority: 20,
      });
    }
  }

  // ── KESSIA Score ──────────────────────────────────────────
  const score = await computeKessiaScore(userId);
  if (score.score >= 700) {
    insights.push({
      id: 'score-high', kind: 'celebrate', icon: '🏆',
      title: t('srvInsights.scoreHighTitle', { score: score.score, band: score.bandLabel }),
      body: t('srvInsights.scoreHighBody'),
      actionLabel: t('srvInsights.seeDetail'), actionUrl: '/profile/score', priority: 15,
    });
  } else if (score.advice.length > 0) {
    insights.push({
      id: 'score-improve', kind: 'tip', icon: '📈',
      title: t('srvInsights.scoreImproveTitle', { score: score.score }),
      body: score.advice[0],
      actionLabel: t('srvInsights.howToProgress'), actionUrl: '/profile/score', priority: 30,
    });
  }

  // ── Bienvenue (compte récent, peu d'insights) ─────────────
  if (now - user.createdAt.getTime() < 3 * DAY && insights.length < 2) {
    insights.push({
      id: 'welcome', kind: 'action', icon: '👋',
      title: t('srvInsights.welcomeTitle', { name: user.firstName }),
      body: t('srvInsights.welcomeBody'),
      actionLabel: t('srvInsights.verifyIdentity'), actionUrl: '/profile/kyc', priority: 70,
    });
  }

  return insights.sort((a, b) => b.priority - a.priority).slice(0, 6);
}

function cur(c?: string | null): string {
  return c === 'XOF' || c === 'XAF' || !c ? 'FCFA' : c;
}
