// ============================================================
// KESSIA — GET/POST /api/v1/payments (cahier des charges §43)
// Dépôts / retraits via l'abstraction PaymentProvider.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { createPayment, listProviders } from '@/lib/payments';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';
import { checkOutboundLimit } from '@/lib/kyc/limits';
import { assessEvent } from '@/lib/fraud/engine';
import { ok, badRequest, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const paymentSchema = z.object({
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  method: z.enum(['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'QR', 'CARD']),
  amount: z.number().positive().max(5_000_000, 'Montant trop élevé'),
  account: z.string().max(64).optional(),
  description: z.string().max(200).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const payments = await prisma.paymentTransaction.findMany({
      where: { userId: context.userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true, provider: true, method: true, direction: true, amount: true,
        currency: true, status: true, externalRef: true, simulated: true,
        ledgerEntryId: true, createdAt: true,
      },
    });

    return ok({
      payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      providers: listProviders(),
    });
  } catch (e) {
    logApiError('/v1/payments', e);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'payments', {
      limit: 15, windowMs: 60_000, by: context.userId,
    });
    if (limited) return limited;

    const parsed = paymentSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { direction, method, amount, account, description } = parsed.data;

    const wallet = await prisma.wallet.findUnique({ where: { userId: context.userId } });
    if (!wallet) return notFound('Wallet introuvable.');
    if (wallet.isLocked) return badRequest('Votre wallet est temporairement verrouillé.');
    if (direction === 'OUTBOUND' && Number(wallet.balance) < amount) {
      return badRequest('Solde insuffisant pour ce retrait.');
    }

    // Plafonds KYC (§30) sur les retraits
    if (direction === 'OUTBOUND') {
      const limit = await checkOutboundLimit(context.userId, amount);
      if (!limit.allowed) return badRequest(limit.reason ?? 'Plafond de transaction atteint.');
    }

    const result = await createPayment({
      userId: context.userId,
      walletId: wallet.id,
      amount,
      currency: wallet.currency,
      method,
      direction,
      account,
      description,
    });

    if (!result.ok || !result.payment) {
      return badRequest(result.error ?? 'Paiement impossible.');
    }

    void recordAudit({
      userId: context.userId,
      action: direction === 'INBOUND' ? 'payment.deposit' : 'payment.withdrawal',
      entity: 'PaymentTransaction',
      entityId: result.payment.id,
      metadata: { amount, method, provider: result.payment.provider, status: result.payment.status, simulated: result.payment.simulated },
      request,
    });

    if (direction === 'OUTBOUND') {
      void assessEvent({
        userId: context.userId, context: 'withdrawal', amount,
        balanceBefore: Number(wallet.balance), entityId: result.payment.id, request,
      });
    }

    return ok(
      result.payment,
      result.payment.status === 'PENDING'
        ? 'Paiement initié. Il sera confirmé sous peu.'
        : `${direction === 'INBOUND' ? 'Dépôt' : 'Retrait'} de ${amount.toLocaleString('fr-FR')} ${wallet.currency} effectué.`
    );
  } catch (e) {
    logApiError('/v1/payments', e);
    return serverError();
  }
}
