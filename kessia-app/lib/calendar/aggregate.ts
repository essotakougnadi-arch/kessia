// ============================================================
// KESSIA — Agenda (cahier des charges §26)
//
// Agrège les échéances de l'utilisateur en une seule vue :
// cotisations de tontine, factures à encaisser, échéances du plan
// de croissance, relances clients. Lecture seule, données réelles.
// ============================================================

import prisma from '@/lib/db/prisma';
import { computeGrowthPlan } from '@/lib/growth/plan';
import { serverT } from '@/lib/i18n/server';

const DAY = 86_400_000;

export type CalendarEventType = 'TONTINE' | 'INVOICE' | 'GROWTH' | 'FOLLOWUP';

export type CalendarEvent = {
  id: string;
  date: string;
  type: CalendarEventType;
  title: string;
  detail: string;
  href: string;
  amount: number | null;
  overdue: boolean;
};

export type CalendarView = {
  from: string;
  to: string;
  events: CalendarEvent[];
  counts: { overdue: number; next7d: number; total: number };
};

export async function computeCalendar(userId: string): Promise<CalendarView> {
  const now = Date.now();
  const from = new Date(now - 14 * DAY);
  const to = new Date(now + 60 * DAY);
  const t = serverT();

  const [memberships, businesses, growth] = await Promise.all([
    prisma.tontineMember.findMany({
      where: { userId, status: 'ACTIVE', tontine: { status: 'ACTIVE' } },
      select: {
        tontine: { select: { id: true, name: true, amount: true, currentRound: true, nextContributionDate: true } },
      },
    }),
    prisma.business.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        id: true, name: true,
        invoices: {
          where: { kind: 'INVOICE', status: { in: ['SENT', 'OVERDUE'] }, dueDate: { not: null } },
          select: { id: true, invoiceNumber: true, customerName: true, total: true, dueDate: true },
        },
        customers: {
          where: { nextFollowUpAt: { not: null } },
          select: { id: true, name: true, nextFollowUpAt: true, followUpNote: true },
        },
      },
    }),
    computeGrowthPlan(userId).catch(() => null),
  ]);

  const events: CalendarEvent[] = [];

  for (const m of memberships) {
    const tt = m.tontine;
    if (!tt.nextContributionDate) continue;
    const d = new Date(tt.nextContributionDate);
    events.push({
      id: `tontine-${tt.id}`,
      date: d.toISOString(),
      type: 'TONTINE',
      title: t('srvCalendar.contribution', { name: tt.name }),
      detail: t('srvCalendar.round', { round: tt.currentRound }),
      href: `/tontine/${tt.id}`,
      amount: Number(tt.amount),
      overdue: d.getTime() < now,
    });
  }

  for (const b of businesses) {
    for (const inv of b.invoices) {
      const d = new Date(inv.dueDate!);
      events.push({
        id: `invoice-${inv.id}`,
        date: d.toISOString(),
        type: 'INVOICE',
        title: t('srvCalendar.invoice', {
          number: inv.invoiceNumber,
          customer: inv.customerName ?? t('srvCalendar.clientFallback'),
        }),
        detail: b.name,
        href: `/business/${b.id}?tab=factures`,
        amount: Number(inv.total),
        overdue: d.getTime() < now,
      });
    }
    for (const c of b.customers) {
      const d = new Date(c.nextFollowUpAt!);
      events.push({
        id: `followup-${c.id}`,
        date: d.toISOString(),
        type: 'FOLLOWUP',
        title: t('srvCalendar.followUp', { name: c.name }),
        detail: c.followUpNote || b.name,
        href: `/business/${b.id}?tab=clients`,
        amount: null,
        overdue: d.getTime() < now,
      });
    }
  }

  if (growth) {
    for (const step of growth.steps) {
      if (step.status === 'DONE' || step.status === 'SKIPPED') continue;
      events.push({
        id: `growth-${step.key}`,
        date: step.dueDate,
        type: 'GROWTH',
        title: step.title,
        detail: `${step.categoryLabel} · ${step.metricLabel} : ${step.targetHint}`,
        href: step.actionUrl,
        amount: null,
        overdue: step.overdue,
      });
    }
  }

  const inRange = events
    .filter((e) => {
      const t = new Date(e.date).getTime();
      return t >= from.getTime() && t <= to.getTime();
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const next7 = now + 7 * DAY;
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    events: inRange,
    counts: {
      overdue: inRange.filter((e) => e.overdue).length,
      next7d: inRange.filter((e) => !e.overdue && new Date(e.date).getTime() <= next7).length,
      total: inRange.length,
    },
  };
}
