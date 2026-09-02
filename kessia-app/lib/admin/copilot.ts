// ============================================================
// KESSIA — Admin Copilot (cahier des charges §17)
//
// Assistant back-office à base de règles : « priorités du jour »
// dérivées de l'état réel de la plateforme (KYC en attente, tickets
// urgents, cotisations en retard, demandes de garantie, alertes
// fraude…). Déterministe, aucune donnée inventée.
// ============================================================

import prisma from '@/lib/db/prisma';
import { serverT } from '@/lib/i18n/server';

const DAY = 86_400_000;

export type AdminPriority = {
  id: string;
  severity: 'info' | 'warn' | 'urgent';
  icon: string;
  title: string;
  detail: string;
  count: number;
  href: string;
};

export async function computeAdminPriorities(): Promise<AdminPriority[]> {
  const now = Date.now();
  const t = serverT();
  const out: AdminPriority[] = [];

  const [kycStale, ticketsUrgent, guaranteePending, fraudOpen, lateContribCount, suspendedRecent] = await Promise.all([
    prisma.kycCase.count({
      where: { status: 'UNDER_REVIEW', submittedAt: { lt: new Date(now - 2 * DAY) } },
    }),
    prisma.supportTicket.count({
      where: { status: { in: ['OPEN', 'WAITING'] }, priority: { in: ['HIGH', 'URGENT'] } },
    }),
    prisma.guaranteeClaim.count({ where: { status: 'PENDING' } }),
    prisma.fraudAlert.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } }),
    prisma.tontineContribution.count({ where: { status: 'LATE' } }),
    prisma.user.count({ where: { isActive: false, updatedAt: { gte: new Date(now - 7 * DAY) } } }),
  ]);

  if (fraudOpen > 0) out.push({
    id: 'fraud', severity: 'urgent', icon: '🛡️',
    title: t('admin.priorities.fraudTitle', { count: fraudOpen }),
    detail: t('admin.priorities.fraudDetail'),
    count: fraudOpen, href: '/admin/fraud',
  });

  if (kycStale > 0) out.push({
    id: 'kyc', severity: 'warn', icon: '🪪',
    title: t('admin.priorities.kycTitle', { count: kycStale }),
    detail: t('admin.priorities.kycDetail'),
    count: kycStale, href: '/admin/kyc',
  });

  if (ticketsUrgent > 0) out.push({
    id: 'tickets', severity: 'warn', icon: '🎧',
    title: t('admin.priorities.ticketsTitle', { count: ticketsUrgent }),
    detail: t('admin.priorities.ticketsDetail'),
    count: ticketsUrgent, href: '/admin/support',
  });

  if (guaranteePending > 0) out.push({
    id: 'guarantee', severity: 'info', icon: '🛟',
    title: t('admin.priorities.guaranteeTitle', { count: guaranteePending }),
    detail: t('admin.priorities.guaranteeDetail'),
    count: guaranteePending, href: '/admin/guarantee',
  });

  if (lateContribCount > 0) out.push({
    id: 'late', severity: 'info', icon: '⏰',
    title: t('admin.priorities.lateTitle', { count: lateContribCount }),
    detail: t('admin.priorities.lateDetail'),
    count: lateContribCount, href: '/admin/tontines',
  });

  if (suspendedRecent > 0) out.push({
    id: 'suspended', severity: 'info', icon: '🚫',
    title: t('admin.priorities.suspendedTitle', { count: suspendedRecent }),
    detail: t('admin.priorities.suspendedDetail'),
    count: suspendedRecent, href: '/admin/users',
  });

  const order = { urgent: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
