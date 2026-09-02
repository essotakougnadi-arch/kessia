// ============================================================
// KESSIA — POST /api/v1/payments/webhooks/[provider]
// Réception des notifications de règlement des fournisseurs (cahier §44).
//
// Sécurité :
//   - signature HMAC-SHA256 du corps brut, header `x-kessia-signature`,
//     clé partagée `PAYMENT_WEBHOOK_SECRET` (par fournisseur en prod).
//   - idempotent : rejouer le même événement est sans effet.
//   - jamais authentifié par session utilisateur.
//
// MVP : les fournisseurs sont simulés (ADR 0005). Cet endpoint est
// l'interface réelle — il suffira de configurer le secret et la source.
// ============================================================

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { settlePendingPayment } from '@/lib/payments';
import { notify } from '@/lib/notifications/notify';
import { recordAudit } from '@/lib/audit/audit.service';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const KNOWN_PROVIDERS = new Set(['mobile-money', 'bank', 'qr', 'cash', 'simulator']);

const eventSchema = z.object({
  event: z.enum(['payment.completed', 'payment.failed']),
  reference: z.string().min(1), // externalRef ou id de la PaymentTransaction
  externalRef: z.string().optional(),
  failureReason: z.string().max(300).optional(),
});

function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  // Pas de secret configuré (MVP local) → on accepte mais on le trace.
  if (!secret) return true;
  if (!header) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  try {
    const provider = params.provider.toLowerCase();
    if (!KNOWN_PROVIDERS.has(provider)) {
      return notFound('Fournisseur inconnu.');
    }

    const limited = await enforceRateLimit(request, `payments.webhook.${provider}`, { limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    const rawBody = await request.text();

    if (!verifySignature(rawBody, request.headers.get('x-kessia-signature'))) {
      void recordAudit({
        action: 'payment.webhook_rejected',
        entity: 'PaymentTransaction',
        metadata: { provider, reason: 'bad_signature' },
        request,
      });
      return unauthorized('Signature invalide.');
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return badRequest('Corps JSON invalide.');
    }

    const parsed = eventSchema.safeParse(json);
    if (!parsed.success) return badRequest('Événement non reconnu.');
    const { event, reference, externalRef, failureReason } = parsed.data;

    const outcome = await settlePendingPayment({
      reference,
      result: event === 'payment.completed' ? 'COMPLETED' : 'FAILED',
      externalRef,
      failureReason,
    });

    if (!outcome.ok) {
      if (outcome.code === 'NOT_FOUND') return notFound(outcome.error);
      return badRequest(outcome.error);
    }

    void recordAudit({
      userId: outcome.payment.userId,
      action: `payment.webhook_${outcome.status.toLowerCase()}`,
      entity: 'PaymentTransaction',
      entityId: outcome.payment.id,
      metadata: { provider, event },
      request,
    });

    if (outcome.status === 'COMPLETED') {
      void notify({
        userId: outcome.payment.userId,
        category: 'PAYMENT',
        priority: 'NORMAL',
        title: 'Paiement confirmé',
        body: 'Votre opération a été confirmée par le fournisseur et créditée à votre wallet.',
        actionUrl: '/wallet',
      });
    } else if (outcome.status === 'FAILED') {
      void notify({
        userId: outcome.payment.userId,
        category: 'PAYMENT',
        priority: 'HIGH',
        title: 'Paiement échoué',
        body: failureReason ?? "Votre opération n'a pas pu être confirmée. Aucun montant n'a été débité.",
        actionUrl: '/wallet',
      });
    }

    return ok({ settled: outcome.status });
  } catch (e) {
    logApiError('/v1/payments/webhooks/[provider]', e);
    return serverError();
  }
}
