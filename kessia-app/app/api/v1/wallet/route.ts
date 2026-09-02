// ============================================================
// KESSIA — GET /api/v1/wallet
// Récupère le wallet et le solde de l'utilisateur connecté
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, notFound, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const wallet = await prisma.wallet.findUnique({
      where: { userId: context.userId },
    });

    if (!wallet) {
      return notFound('Wallet introuvable.');
    }

    // Stats rapides des 30 derniers jours
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [monthlyIn, monthlyOut, totalTx] = await Promise.all([
      prisma.ledgerEntry.aggregate({
        where: {
          walletId: wallet.id,
          direction: 'CREDIT',
          status: 'COMPLETED',
          createdAt: { gte: thirtyDaysAgo },
        },
        _sum: { amount: true },
      }),
      prisma.ledgerEntry.aggregate({
        where: {
          walletId: wallet.id,
          direction: 'DEBIT',
          status: 'COMPLETED',
          createdAt: { gte: thirtyDaysAgo },
        },
        _sum: { amount: true },
      }),
      prisma.ledgerEntry.count({ where: { walletId: wallet.id } }),
    ]);

    return ok({
      id: wallet.id,
      balance: Number(wallet.balance),
      currency: wallet.currency,
      isLocked: wallet.isLocked,
      createdAt: wallet.createdAt,
      stats: {
        monthlyIn: Number(monthlyIn._sum.amount ?? 0),
        monthlyOut: Number(monthlyOut._sum.amount ?? 0),
        totalTransactions: totalTx,
      },
    });
  } catch (error) {
    logApiError('/v1/wallet', error);
    return serverError();
  }
}
