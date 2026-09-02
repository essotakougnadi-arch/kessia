// ============================================================
// KESSIA — Objectifs d'entreprise : progression calculée (§7)
// ============================================================

import prisma from '@/lib/db/prisma';
import type { GoalMetric, GoalPeriod } from '@prisma/client';

export const GOAL_METRIC_LABEL: Record<GoalMetric, string> = {
  REVENUE: "Chiffre d'affaires",
  MARGIN_RATE: 'Taux de marge',
  SALES_COUNT: 'Nombre de ventes',
  NEW_CUSTOMERS: 'Nouveaux clients',
};

export const GOAL_PERIOD_LABEL: Record<GoalPeriod, string> = {
  MONTH: 'ce mois',
  QUARTER: 'ce trimestre',
  YEAR: 'cette année',
};

export function periodBounds(period: GoalPeriod, ref: Date = new Date()): { start: Date; end: Date } {
  const y = ref.getFullYear();
  if (period === 'MONTH') return { start: new Date(y, ref.getMonth(), 1), end: new Date(y, ref.getMonth() + 1, 1) };
  if (period === 'QUARTER') {
    const q = Math.floor(ref.getMonth() / 3);
    return { start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 1) };
  }
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
}

export async function computeGoalProgress(businessId: string) {
  const goals = await prisma.businessGoal.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
  });

  return Promise.all(
    goals.map(async (g) => {
      const { start, end } = periodBounds(g.period);
      let current = 0;

      if (g.metric === 'REVENUE' || g.metric === 'MARGIN_RATE') {
        const sales = await prisma.sale.findMany({
          where: { businessId, status: 'COMPLETED', createdAt: { gte: start, lt: end } },
          include: { items: { include: { product: { select: { cost: true } } } } },
        });
        const revenue = sales.reduce((s, x) => s + Number(x.totalAmount), 0);
        if (g.metric === 'REVENUE') {
          current = revenue;
        } else {
          const cost = sales.reduce(
            (s, x) => s + x.items.reduce((c, i) => c + Number(i.product.cost ?? 0) * i.quantity, 0),
            0
          );
          current = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0;
        }
      } else if (g.metric === 'SALES_COUNT') {
        current = await prisma.sale.count({
          where: { businessId, status: 'COMPLETED', createdAt: { gte: start, lt: end } },
        });
      } else {
        current = await prisma.customer.count({
          where: { businessId, type: 'CLIENT', createdAt: { gte: start, lt: end } },
        });
      }

      const target = Number(g.targetValue);
      return {
        id: g.id,
        metric: g.metric,
        metricLabel: GOAL_METRIC_LABEL[g.metric],
        period: g.period,
        periodLabel: GOAL_PERIOD_LABEL[g.period],
        label: g.label,
        target,
        current: Math.round(current),
        pct: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
        unit: g.metric === 'MARGIN_RATE' ? '%' : g.metric === 'REVENUE' ? 'FCFA' : '',
      };
    })
  );
}
