// ============================================================
// KESSIA — GET /api/v1/wallet/transactions/[id]
// Reçu d'une opération du wallet (impression / PDF, §6.1).
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, notFound, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: { firstName: true, lastName: true, phone: true, wallet: { select: { id: true, currency: true } } },
    });
    if (!user?.wallet) return notFound('Wallet introuvable.');

    const entry = await prisma.ledgerEntry.findFirst({
      where: { id: params.id, walletId: user.wallet.id },
    });
    if (!entry) return notFound('Opération introuvable.');

    return ok({
      id: entry.id,
      reference: entry.referenceId ?? entry.idempotencyKey ?? entry.id,
      type: entry.type,
      direction: entry.direction,
      status: entry.status,
      amount: Number(entry.amount),
      balanceAfter: Number(entry.balanceAfter),
      currency: user.wallet.currency,
      description: entry.description,
      createdAt: entry.createdAt,
      processedAt: entry.processedAt,
      account: {
        name: `${user.firstName} ${user.lastName}`,
        phone: user.phone,
      },
    });
  } catch (e) {
    logApiError('/v1/wallet/transactions/[id]', e);
    return serverError();
  }
}
