// ============================================================
// KESSIA — GET /api/v1/admin/overview
// Chiffres réels du back-office (cahier des charges §45).
// RBAC : rôles d'administration uniquement.
// ============================================================

import { NextRequest } from 'next/server';
import { withAuthAndRole } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import type { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES: UserRole[] = ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE', 'FINANCE', 'OPERATIONS', 'SUPPORT'];

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuthAndRole(request, ADMIN_ROLES);
    if (error || !context) return error!;

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [
      usersTotal,
      usersThisMonth,
      kycPending,
      tontinesActive,
      ticketsOpen,
      txAgg,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.user.count({
        where: { kycStatus: { in: ['IN_PROGRESS', 'UNDER_REVIEW', 'ACTION_REQUIRED'] } },
      }),
      prisma.tontine.count({ where: { status: 'ACTIVE' } }),
      prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] } } }),
      prisma.ledgerEntry.aggregate({
        // wallets USER : une jambe par opération (hors contrepartie séquestre)
        where: { status: 'COMPLETED', wallet: { kind: 'USER' } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          kycStatus: true,
          createdAt: true,
        },
      }),
    ]);

    return ok({
      users: { total: usersTotal, thisMonth: usersThisMonth },
      kyc: { pending: kycPending },
      tontines: { active: tontinesActive },
      support: { open: ticketsOpen },
      transactions: {
        count: txAgg._count,
        volume: Number(txAgg._sum.amount ?? 0),
        currency: 'XOF',
      },
      recentUsers: recentUsers.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    logApiError('/v1/admin/overview', e);
    return serverError();
  }
}
