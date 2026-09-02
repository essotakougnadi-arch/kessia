// ============================================================
// KESSIA — Trésorerie d'entreprise (§7)
// Vue calculée : encaissements (ventes + factures payées) vs
// décaissements (dépenses) sur 6 mois, + prévisionnel des
// factures non réglées. Aucune donnée n'est inventée.
// ============================================================

import prisma from '@/lib/db/prisma';
import { serverT } from '@/lib/i18n/server';

export type TreasuryView = {
  currency: string;
  months: Array<{ key: string; label: string; inflow: number; outflow: number; net: number }>;
  totals: { inflow: number; outflow: number; net: number };
  receivables: { total: number; overdue: number; upcoming: number; count: number };
  runwayNote: string | null;
};

export async function computeTreasury(businessId: string): Promise<TreasuryView> {
  const now = new Date();
  const t = serverT();
  const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [sales, expenses, paidInvoices, openInvoices] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId, status: 'COMPLETED', createdAt: { gte: from } },
      select: { totalAmount: true, createdAt: true },
    }),
    prisma.expense.findMany({
      where: { businessId, date: { gte: from } },
      select: { amount: true, date: true },
    }),
    prisma.invoice.findMany({
      where: { businessId, kind: 'INVOICE', status: 'PAID', paidAt: { gte: from } },
      select: { total: true, paidAt: true },
    }),
    prisma.invoice.findMany({
      where: { businessId, kind: 'INVOICE', status: { in: ['SENT', 'OVERDUE'] } },
      select: { total: true, dueDate: true },
    }),
  ]);

  const buckets = new Map<string, { inflow: number; outflow: number }>();
  const keyFor = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    buckets.set(keyFor(d), { inflow: 0, outflow: 0 });
  }
  const add = (d: Date, field: 'inflow' | 'outflow', amount: number) => {
    const b = buckets.get(keyFor(d));
    if (b) b[field] += amount;
  };

  for (const s of sales) add(s.createdAt, 'inflow', Number(s.totalAmount));
  for (const p of paidInvoices) if (p.paidAt) add(p.paidAt, 'inflow', Number(p.total));
  for (const e of expenses) add(e.date, 'outflow', Number(e.amount));

  const months = [...buckets.entries()].map(([key, v]) => {
    const [y, m] = key.split('-').map(Number);
    return {
      key,
      label: `${t(`srvTreasury.m.${m}`)} ${String(y).slice(2)}`,
      inflow: Math.round(v.inflow),
      outflow: Math.round(v.outflow),
      net: Math.round(v.inflow - v.outflow),
    };
  });

  const totals = months.reduce(
    (t, m) => ({ inflow: t.inflow + m.inflow, outflow: t.outflow + m.outflow, net: t.net + m.net }),
    { inflow: 0, outflow: 0, net: 0 }
  );

  const overdue = openInvoices
    .filter((i) => i.dueDate && i.dueDate < now)
    .reduce((s, i) => s + Number(i.total), 0);
  const upcoming = openInvoices
    .filter((i) => !i.dueDate || i.dueDate >= now)
    .reduce((s, i) => s + Number(i.total), 0);

  // Note d'autonomie simple : décaissement mensuel moyen vs trésorerie nette
  const avgOutflow = totals.outflow / 6;
  let runwayNote: string | null = null;
  if (avgOutflow > 0 && totals.net > 0) {
    const monthsRunway = totals.net / avgOutflow;
    runwayNote = t('srvTreasury.runwayCovers', { months: monthsRunway.toFixed(1) });
  } else if (totals.net < 0) {
    runwayNote = t('srvTreasury.runwayNegative');
  }

  return {
    currency: 'XOF',
    months,
    totals,
    receivables: { total: Math.round(overdue + upcoming), overdue: Math.round(overdue), upcoming: Math.round(upcoming), count: openInvoices.length },
    runwayNote,
  };
}
