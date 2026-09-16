// ============================================================
// KESSIA — POST /api/v1/payments/webhooks/[provider]
// Réception des notifications de règlement des fournisseurs (cahier §44).
//
// Sécurité (P0.3) :
//   - signature `t=<horodatage>,v1=<HMAC-SHA256>` du corps brut, header
//     `x-kessia-signature`, clé partagée `PAYMENT_WEBHOOK_SECRET` (voir
//     `lib/webhooks/verify.ts`) — lie authenticité + horodatage, fenêtre
//     de tolérance anti-rejeu de 5 min.
//   - fail-closed en production : secret absent → 401 (aucun secret
//     configuré = aucun fournisseur réel connecté, ADR 0005).
//   - idempotence stricte au niveau transport (`WebhookEvent.eventKey`
//     unique) EN PLUS de l'idempotence métier déjà en place
//     (`settlePendingPayment`, clé ledger `PAYTX_<id>`) — rejouer le
//     même événement est sans effet, quel que soit le niveau considéré.
//   - jamais authentifié par session utilisateur.
//
// MVP : les fournisseurs sont simulés (ADR 0005). Cet endpoint est
// l'interface réelle — il suffira de configurer le secret et la source.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { settlePendingPayment } from '@/lib/payments';
import { notify } from '@/lib/notifications/notify';
import { recordAudit, requestMeta } from '@/lib/audit/audit.service';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { verifyWebhookSignature } from '@/lib/webhooks/verify';
import { recordWebhookAttempt, markWebhookProcessed, markWebhookFailed, recordWebhookRejection } from '@/lib/webhooks/journal';
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

export async function POST(request: NextRequest, props: { params: Promise<{ provider: string }> }) {
  const params = await props.params;
  try {
    const provider = params.provider.toLowerCase();
    if (!KNOWN_PROVIDERS.has(provider)) {
      return notFound('Fournisseur inconnu.');
    }

    const limited = await enforceRateLimit(request, `payments.webhook.${provider}`, { limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    const rawBody = await request.text();
    const { ipAddress } = requestMeta(request);

    const verification = verifyWebhookSignature(
      rawBody,
      request.headers.get('x-kessia-signature'),
      process.env.PAYMENT_WEBHOOK_SECRET
    );

    if (!verification.ok) {
      void recordWebhookRejection({ provider: `payment:${provider}`, eventType: 'unknown', reason: verification.reason, ipAddress });
      void recordAudit({
        action: 'payment.webhook_rejected',
        entity: 'PaymentTransaction',
        metadata: { provider, reason: verification.reason },
        request,
      });
      return unauthorized('Signature invalide, absente ou expirée.');
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

    // Idempotence stricte au niveau transport : un rejeu exact du même
    // événement (même fournisseur+type+référence) n'est jamais retraité.
    const attempt = await recordWebhookAttempt({
      provider: `payment:${provider}`,
      eventType: event,
      eventKey: `payment:${provider}:${event}:${reference}`,
      verified: verification.verified,
      ipAddress,
    });

    if (attempt.duplicate) {
      return ok({ settled: 'ALREADY_SETTLED', duplicate: true });
    }

    const outcome = await settlePendingPayment({
      reference,
      result: event === 'payment.completed' ? 'COMPLETED' : 'FAILED',
      externalRef,
      failureReason,
    });

    if (!outcome.ok) {
      await markWebhookFailed(attempt.eventId, outcome.error);
      if (outcome.code === 'NOT_FOUND') return notFound(outcome.error);
      return badRequest(outcome.error);
    }

    await markWebhookProcessed(attempt.eventId);

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
