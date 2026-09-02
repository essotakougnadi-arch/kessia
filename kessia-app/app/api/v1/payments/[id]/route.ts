// ============================================================
// KESSIA — GET /api/v1/payments/[id]
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, notFound, forbidden, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const payment = await prisma.paymentTransaction.findUnique({ where: { id: params.id } });
    if (!payment) return notFound('Paiement introuvable.');
    if (payment.userId !== context.userId) return forbidden();

    return ok({ ...payment, amount: Number(payment.amount) });
  } catch (e) {
    logApiError('/v1/payments/[id]', e);
    return serverError();
  }
}
