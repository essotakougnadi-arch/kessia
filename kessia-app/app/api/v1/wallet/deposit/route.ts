// ============================================================
// KESSIA — POST /api/v1/wallet/deposit
// Raccourci vers /api/v1/payments (direction INBOUND).
// Conservé pour compatibilité avec le wallet actuel.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { createPayment } from '@/lib/payments';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';
import { ok, badRequest, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const depositSchema = z.object({
  amount: z.number().positive('Le montant doit être positif').max(5_000_000, 'Montant trop élevé'),
  method: z.enum(['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH']).default('MOBILE_MONEY'),
  account: z.string().max(64).optional(),
  description: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'wallet.deposit', {
      limit: 15, windowMs: 60_000, by: context.userId,
    });
    if (limited) return limited;

    const parsed = depositSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { amount, method, account, description } = parsed.data;

    const wallet = await prisma.wallet.findUnique({ where: { userId: context.userId } });
    if (!wallet) return notFound('Wallet introuvable.');
    if (wallet.isLocked) return badRequest('Votre wallet est temporairement verrouillé.');

    const result = await createPayment({
      userId: context.userId,
      walletId: wallet.id,
      amount,
      currency: wallet.currency,
      method,
      direction: 'INBOUND',
      account,
      description,
    });

    if (!result.ok || !result.payment) {
      return badRequest(result.error ?? 'Erreur lors du dépôt.');
    }

    void recordAudit({
      userId: context.userId,
      action: 'wallet.deposit',
      entity: 'PaymentTransaction',
      entityId: result.payment.id,
      metadata: { amount, method, provider: result.payment.provider, status: result.payment.status },
      request,
    });

    return ok(
      {
        paymentId: result.payment.id,
        entryId: result.payment.ledgerEntryId,
        amount,
        balanceAfter: result.payment.balanceAfter,
        method,
        status: result.payment.status,
        simulated: result.payment.simulated,
      },
      result.payment.status === 'PENDING'
        ? 'Dépôt initié. Il sera confirmé sous peu.'
        : `Dépôt de ${amount.toLocaleString('fr-FR')} ${wallet.currency} effectué avec succès.`
    );
  } catch (error) {
    logApiError('/v1/wallet/deposit', error);
    return serverError();
  }
}
