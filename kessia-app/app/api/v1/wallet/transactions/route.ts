// ============================================================
// KESSIA — GET /api/v1/wallet/transactions
// Historique paginé des transactions du wallet
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, notFound, serverError, badRequest } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));
    const type = searchParams.get('type');
    const direction = searchParams.get('direction');

    if (isNaN(page) || isNaN(limit)) {
      return badRequest('Paramètres de pagination invalides.');
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId: context.userId },
      select: { id: true },
    });

    if (!wallet) {
      return notFound('Wallet introuvable.');
    }

    const skip = (page - 1) * limit;

    // Filtres optionnels
    const where: Record<string, unknown> = { walletId: wallet.id };
    if (type) where.type = type;
    if (direction) where.direction = direction;

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.ledgerEntry.count({ where }),
    ]);

    return ok({
      entries: entries.map((e) => ({
        ...e,
        amount: Number(e.amount),
        balanceBefore: Number(e.balanceBefore),
        balanceAfter: Number(e.balanceAfter),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + entries.length < total,
      },
    });
  } catch (error) {
    logApiError('/v1/wallet/transactions', error);
    return serverError();
  }
}
