// ============================================================
// KESSIA — Plan de croissance : assemblage (§23)
//
// Rassemble les signaux (KESSIA Score, ADN, tontines, KYC…),
// génère les étapes via lib/growth/rules.ts (pur), puis fusionne
// la progression persistée (GrowthStepState). Rien n'est inventé.
// ============================================================

import prisma from '@/lib/db/prisma';
import type { GrowthStepStatus } from '@prisma/client';
import { computeKessiaScore } from '@/lib/score/score.service';
import { serverT } from '@/lib/i18n/server';
import {
  buildGrowthSteps, growthCategoryLabel,
  type GrowthCategory, type GrowthSignals, type BusinessSignal,
} from './rules';

const DAY = 86_400_000;
const HORIZON_WEEKS = 8;

const BAND_ORDER = ['NOUVEAU', 'EN_CONSTRUCTION', 'FIABLE', 'TRES_FIABLE', 'EXEMPLAIRE'];
const BAND_FLOOR: Record<string, number> = {
  NOUVEAU: 0, EN_CONSTRUCTION: 400, FIABLE: 550, TRES_FIABLE: 700, EXEMPLAIRE: 850,
};

export type GrowthStep = {
  key: string;
  category: GrowthCategory;
  categoryLabel: string;
  title: string;
  why: string;
  actionLabel: string;
  actionUrl: string;
  metricLabel: string;
  targetHint: string;
  impact: number;
  status: GrowthStepStatus;
  note: string | null;
  dueDate: string;
  completedAt: string | null;
  overdue: boolean;
};

export type GrowthPlan = {
  horizonWeeks: number;
  generatedAt: string;
  headline: string;
  score: { value: number; band: string; bandLabel: string; toNextBand: number | null };
  summary: { total: number; done: number; active: number; skipped: number; completionPct: number };
  steps: GrowthStep[];
};

const STATUS_RANK: Record<GrowthStepStatus, number> = { DOING: 0, TODO: 1, DONE: 2, SKIPPED: 3 };

export async function computeGrowthPlan(userId: string): Promise<GrowthPlan> {
  const now = Date.now();
  const t = serverT();

  const [user, walletOps, memberships, contributions, businesses, score, states] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { kycStatus: true, twoFactorEnabled: true },
    }),
    prisma.ledgerEntry.count({ where: { wallet: { userId }, status: 'COMPLETED' } }),
    prisma.tontineMember.findMany({ where: { userId, status: 'ACTIVE' }, select: { id: true } }),
    prisma.tontineContribution.count({ where: { member: { userId }, status: 'LATE' } }),
    prisma.business.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        id: true, name: true,
        products: { select: { stock: true } },
        goals: { select: { id: true } },
        suppliers: { select: { id: true } },
        sales: {
          where: { status: 'COMPLETED', createdAt: { gte: new Date(now - 30 * DAY) } },
          select: { items: { select: { quantity: true, totalPrice: true, product: { select: { cost: true } } } } },
        },
        customers: { select: { _count: { select: { sales: true } } } },
        invoices: { where: { kind: 'QUOTE', status: { in: ['DRAFT', 'SENT'] }, convertedInvoiceId: null }, select: { id: true } },
      },
    }),
    computeKessiaScore(userId),
    prisma.growthStepState.findMany({ where: { userId } }),
  ]);

  const kycVerified = user?.kycStatus === 'VERIFIED';
  const kycStarted = user?.kycStatus === 'IN_PROGRESS' || user?.kycStatus === 'UNDER_REVIEW' || user?.kycStatus === 'ACTION_REQUIRED';

  const businessSignals: BusinessSignal[] = businesses.map((b) => {
    let revenue = 0;
    let cost = 0;
    for (const sale of b.sales) {
      for (const it of sale.items) {
        revenue += Number(it.totalPrice);
        cost += Number(it.product.cost ?? 0) * it.quantity;
      }
    }
    const grossMarginRate = revenue > 0 && cost > 0 ? Math.round(((revenue - cost) / revenue) * 100) : null;
    return {
      id: b.id,
      name: b.name,
      salesCount30: b.sales.length,
      grossMarginRate,
      lowStock: b.products.filter((p) => p.stock > 0 && p.stock <= 5).length,
      recurringCustomers: b.customers.filter((c) => c._count.sales >= 2).length,
      goalsCount: b.goals.length,
      suppliersCount: b.suppliers.length,
      openQuotes: b.invoices.length,
    };
  });

  const idx = BAND_ORDER.indexOf(score.band);
  const nextBand = idx >= 0 && idx < BAND_ORDER.length - 1 ? BAND_ORDER[idx + 1] : null;
  const toNextBand = nextBand ? Math.max(0, BAND_FLOOR[nextBand] - score.score) : null;

  const signals: GrowthSignals = {
    kycVerified,
    kycStarted,
    twoFactorEnabled: !!user?.twoFactorEnabled,
    walletOps,
    activeTontines: memberships.length,
    lateContributions: contributions,
    scoreBand: score.band,
    scoreToNextBand: toNextBand,
    businesses: businessSignals,
  };

  const defs = buildGrowthSteps(signals, t);
  const stateByKey = new Map(states.map((s) => [s.stepKey, s]));

  const steps: GrowthStep[] = defs.map((d) => {
    const st = stateByKey.get(d.key);
    const status: GrowthStepStatus = st?.status ?? 'TODO';
    const createdRef = st?.createdAt?.getTime() ?? now;
    const dueDate = new Date(createdRef + d.dueInDays * DAY);
    return {
      key: d.key,
      category: d.category,
      categoryLabel: growthCategoryLabel(t, d.category),
      title: d.title,
      why: d.why,
      actionLabel: d.actionLabel,
      actionUrl: d.actionUrl,
      metricLabel: d.metricLabel,
      targetHint: d.targetHint,
      impact: d.impact,
      status,
      note: st?.note ?? null,
      dueDate: dueDate.toISOString(),
      completedAt: st?.completedAt?.toISOString() ?? null,
      overdue: status !== 'DONE' && status !== 'SKIPPED' && dueDate.getTime() < now,
    };
  });

  steps.sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    b.impact - a.impact ||
    a.key.localeCompare(b.key)
  );

  const counted = steps.filter((s) => s.status !== 'SKIPPED');
  const done = counted.filter((s) => s.status === 'DONE').length;
  const active = counted.filter((s) => s.status === 'TODO' || s.status === 'DOING').length;
  const skipped = steps.length - counted.length;
  const completionPct = counted.length ? Math.round((done / counted.length) * 100) : 0;

  const firstActive = steps.find((s) => s.status === 'DOING') ?? steps.find((s) => s.status === 'TODO');
  let headline: string;
  if (counted.length === 0) headline = t('srvGrowth.headline.nothing');
  else if (completionPct >= 80) headline = t('srvGrowth.headline.almostDone', { pct: completionPct });
  else if (firstActive) headline = t('srvGrowth.headline.nextPriority', { title: firstActive.title });
  else headline = t('srvGrowth.headline.allActiveDone');

  return {
    horizonWeeks: HORIZON_WEEKS,
    generatedAt: new Date(now).toISOString(),
    headline,
    score: { value: score.score, band: score.band, bandLabel: score.bandLabel, toNextBand },
    summary: { total: counted.length, done, active, skipped, completionPct },
    steps,
  };
}

/** Met à jour la progression d'une étape (upsert). */
export async function setGrowthStepStatus(
  userId: string,
  stepKey: string,
  status: GrowthStepStatus,
  note?: string | null,
) {
  return prisma.growthStepState.upsert({
    where: { userId_stepKey: { userId, stepKey } },
    create: {
      userId, stepKey, status,
      note: note ?? null,
      completedAt: status === 'DONE' ? new Date() : null,
    },
    update: {
      status,
      ...(note !== undefined ? { note } : {}),
      completedAt: status === 'DONE' ? new Date() : null,
    },
  });
}
