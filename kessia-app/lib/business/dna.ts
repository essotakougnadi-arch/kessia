// ============================================================
// KESSIA — Business DNA (cahier des charges §8)
//
// Profil numérique structuré de l'entreprise, agrégé à partir de
// données existantes (identité, activité, marges, clients, objectifs).
// Sert de base au Business Advisor de KESSIA AI. Rien n'est inventé —
// chaque chiffre provient des ventes, dépenses, produits saisis.
// ============================================================

import prisma from '@/lib/db/prisma';
import { serverT } from '@/lib/i18n/server';
import { computeGoalProgress } from './goals';

const DAY = 86_400_000;

export type BusinessDNA = {
  identity: {
    id: string; name: string; sector: string; city: string | null;
    owner: string; ageMonths: number; createdAt: string;
  };
  activity: {
    productCount: number;
    salesCount30: number; salesCount90: number;
    revenue30: number; revenue90: number;
    avgBasket: number;
    grossMarginRate: number | null;
    categoryMix: Array<{ category: string; share: number }>;
    topProducts: Array<{ name: string; revenue: number; units: number }>;
  };
  customers: { total: number; recurring: number; topCustomer: string | null; withFollowUp: number };
  suppliers: { count: number; spend90: number };
  goals: { active: number; onTrack: number };
  health: { score: number; band: string; signals: string[] };
  needs: string[];
};

export async function computeBusinessDNA(businessId: string): Promise<BusinessDNA | null> {
  const now = Date.now();
  const t = serverT();
  const band = (score: number): string => {
    if (score >= 80) return t('srvDna.band.solid');
    if (score >= 60) return t('srvDna.band.correct');
    if (score >= 40) return t('srvDna.band.fragile');
    return t('srvDna.band.toConsolidate');
  };
  const d30 = new Date(now - 30 * DAY);
  const d90 = new Date(now - 90 * DAY);

  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      user: { select: { firstName: true, lastName: true } },
      products: { select: { id: true, name: true, category: true, price: true, cost: true, stock: true } },
      _count: { select: { customers: true, suppliers: true } },
    },
  });
  if (!biz) return null;

  const [sales90, expenses90, customers, goals] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId, status: 'COMPLETED', createdAt: { gte: d90 } },
      include: { items: { include: { product: { select: { name: true, category: true, cost: true } } } } },
    }),
    prisma.expense.aggregate({ where: { businessId, date: { gte: d90 } }, _sum: { amount: true } }),
    prisma.customer.findMany({
      where: { businessId },
      include: { _count: { select: { sales: true } } },
    }),
    computeGoalProgress(businessId),
  ]);

  const sales30 = sales90.filter((s) => s.createdAt >= d30);
  const revenue30 = sales30.reduce((s, x) => s + Number(x.totalAmount), 0);
  const revenue90 = sales90.reduce((s, x) => s + Number(x.totalAmount), 0);
  const cost90 = sales90.reduce(
    (s, x) => s + x.items.reduce((c, i) => c + Number(i.product.cost ?? 0) * i.quantity, 0),
    0
  );
  const grossMarginRate = revenue90 > 0 && cost90 > 0 ? Math.round(((revenue90 - cost90) / revenue90) * 100) : null;

  // Mix par catégorie
  const catRevenue = new Map<string, number>();
  const prodRevenue = new Map<string, { revenue: number; units: number }>();
  for (const s of sales90) {
    for (const i of s.items) {
      const cat = i.product.category ?? t('srvDna.fallbackCategory');
      catRevenue.set(cat, (catRevenue.get(cat) ?? 0) + Number(i.totalPrice));
      const p = prodRevenue.get(i.product.name) ?? { revenue: 0, units: 0 };
      p.revenue += Number(i.totalPrice);
      p.units += i.quantity;
      prodRevenue.set(i.product.name, p);
    }
  }
  const categoryMix = [...catRevenue.entries()]
    .map(([category, rev]) => ({ category, share: revenue90 > 0 ? Math.round((rev / revenue90) * 100) : 0 }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 5);
  const topProducts = [...prodRevenue.entries()]
    .map(([name, v]) => ({ name, revenue: Math.round(v.revenue), units: v.units }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const recurring = customers.filter((c) => c._count.sales >= 2).length;
  const topCustomer =
    [...customers].sort((a, b) => b._count.sales - a._count.sales)[0]?.name ?? null;
  const withFollowUp = customers.filter((c) => c.nextFollowUpAt).length;

  const lowStock = biz.products.filter((p) => p.stock > 0 && p.stock <= 5).length;
  const onTrackGoals = goals.filter((g) => g.pct >= 60).length;

  // Score de santé (0-100)
  const signals: string[] = [];
  let score = 40;
  if (sales30.length >= 8) { score += 15; signals.push(t('srvDna.signal.regularSales')); }
  else if (sales30.length >= 2) score += 7;
  else signals.push(t('srvDna.signal.fewSalesMonth'));
  if (grossMarginRate !== null && grossMarginRate >= 30) { score += 15; signals.push(t('srvDna.signal.grossMargin', { rate: grossMarginRate })); }
  else if (grossMarginRate !== null && grossMarginRate < 15) signals.push(t('srvDna.signal.lowMargin', { rate: grossMarginRate }));
  if (biz.products.length >= 4) score += 8;
  if (recurring >= 3) { score += 12; signals.push(t('srvDna.signal.recurringCustomers', { count: recurring })); }
  else signals.push(t('srvDna.signal.fewRecurring'));
  if (lowStock === 0 && biz.products.length > 0) score += 6;
  else if (lowStock > 0) signals.push(t('srvDna.signal.lowStock', { count: lowStock }));
  if (onTrackGoals > 0) { score += 6; signals.push(t('srvDna.signal.goalsOnTrack', { count: onTrackGoals })); }
  const revenueExpenseRatio = Number(expenses90._sum.amount ?? 0) > 0 ? revenue90 / Number(expenses90._sum.amount) : null;
  if (revenueExpenseRatio !== null && revenueExpenseRatio >= 1.5) score += 8;
  else if (revenueExpenseRatio !== null && revenueExpenseRatio < 1) signals.push(t('srvDna.signal.costsExceedRevenue'));
  score = Math.max(0, Math.min(100, score));

  // Besoins déduits
  const needs: string[] = [];
  if (grossMarginRate !== null && grossMarginRate < 20) needs.push(t('srvDna.need.margin'));
  if (recurring < 3) needs.push(t('srvDna.need.loyalty'));
  if (lowStock > 0) needs.push(t('srvDna.need.restock'));
  if (biz._count.suppliers === 0) needs.push(t('srvDna.need.suppliers'));
  if (goals.length === 0) needs.push(t('srvDna.need.goal'));
  if (sales30.length < 2) needs.push(t('srvDna.need.recordSales'));

  return {
    identity: {
      id: biz.id, name: biz.name, sector: biz.sector, city: biz.city,
      owner: `${biz.user.firstName} ${biz.user.lastName}`,
      ageMonths: Math.max(0, Math.round((now - biz.createdAt.getTime()) / (30 * DAY))),
      createdAt: biz.createdAt.toISOString(),
    },
    activity: {
      productCount: biz.products.length,
      salesCount30: sales30.length,
      salesCount90: sales90.length,
      revenue30: Math.round(revenue30),
      revenue90: Math.round(revenue90),
      avgBasket: sales90.length ? Math.round(revenue90 / sales90.length) : 0,
      grossMarginRate,
      categoryMix,
      topProducts,
    },
    customers: { total: biz._count.customers, recurring, topCustomer, withFollowUp },
    suppliers: { count: biz._count.suppliers, spend90: Math.round(Number(expenses90._sum.amount ?? 0)) },
    goals: { active: goals.length, onTrack: onTrackGoals },
    health: { score, band: band(score), signals },
    needs: needs.slice(0, 4),
  };
}
