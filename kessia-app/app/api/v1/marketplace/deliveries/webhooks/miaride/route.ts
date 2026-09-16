// ============================================================
// KESSIA — POST /api/v1/marketplace/deliveries/webhooks/miaride
// Notifications de statut du partenaire coursier (ADR 0042).
//
// Sécurité (P0.3) : signature `t=<horodatage>,v1=<HMAC-SHA256>` du corps
// brut, header `x-miaride-signature`, clé `MIARIDE_WEBHOOK_SECRET` (voir
// `lib/webhooks/verify.ts`) — fail-closed en production si le secret est
// absent (aucun partenariat réel connecté aujourd'hui). Idempotence
// stricte au niveau transport (`WebhookEvent.eventKey` unique), en plus
// de la garde de statut déjà en place sur `MarketplaceDelivery`.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { settleOnDelivery } from '@/lib/delivery';
import { refundEscrowToBuyer } from '@/lib/marketplace/escrow';
import { notify } from '@/lib/notifications/notify';
import { recordAudit, requestMeta } from '@/lib/audit/audit.service';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { verifyWebhookSignature } from '@/lib/webhooks/verify';
import { recordWebhookAttempt, markWebhookProcessed, markWebhookFailed, recordWebhookRejection } from '@/lib/webhooks/journal';
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import type { DeliveryStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const EXTERNAL_STATUS: Record<string, DeliveryStatus> = {
  assigned: 'COURIER_ASSIGNED',
  accepted: 'COURIER_ASSIGNED',
  picked_up: 'PICKED_UP',
  collected: 'PICKED_UP',
  in_transit: 'IN_TRANSIT',
  on_the_way: 'IN_TRANSIT',
  delivered: 'DELIVERED',
  completed: 'DELIVERED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
};

const eventSchema = z.object({
  event: z.literal('delivery.status'),
  reference: z.string().min(1), // providerRef Miaride (MIA-XXXXXX)
  status: z.string().min(1),
  courierName: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, 'marketplace.delivery.webhook', { limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    const raw = await request.text();
    const { ipAddress } = requestMeta(request);

    const verification = verifyWebhookSignature(
      raw,
      request.headers.get('x-miaride-signature'),
      process.env.MIARIDE_WEBHOOK_SECRET
    );

    if (!verification.ok) {
      void recordWebhookRejection({ provider: 'miaride', eventType: 'delivery.status', reason: verification.reason, ipAddress });
      void recordAudit({ action: 'marketplace.delivery.webhook_rejected', entity: 'MarketplaceDelivery', metadata: { reason: verification.reason }, request });
      return unauthorized('Signature Miaride invalide, absente ou expirée.');
    }

    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return badRequest('Corps JSON invalide.'); }
    const parsed = eventSchema.safeParse(payload);
    if (!parsed.success) return badRequest('Événement mal formé.');
    const { reference, status, courierName } = parsed.data;

    const mapped = EXTERNAL_STATUS[status.toLowerCase()];
    if (!mapped) return badRequest(`Statut inconnu : ${status}`);

    // Idempotence stricte au niveau transport : un rejeu exact de la
    // même transition (référence + statut normalisé) n'est jamais
    // retraité — en plus de la garde de statut terminal ci-dessous.
    const attempt = await recordWebhookAttempt({
      provider: 'miaride',
      eventType: 'delivery.status',
      eventKey: `miaride:${reference}:${mapped}`,
      verified: verification.verified,
      ipAddress,
    });
    if (attempt.duplicate) {
      return ok({ duplicate: true });
    }

    const delivery = await prisma.marketplaceDelivery.findFirst({
      where: { providerRef: reference },
      include: { order: { include: { item: { select: { title: true } } } } },
    });
    if (!delivery) {
      await markWebhookFailed(attempt.eventId, 'delivery_not_found');
      return notFound('Livraison introuvable pour cette référence.');
    }
    if (delivery.status === 'DELIVERED' || delivery.status === 'CANCELLED') {
      await markWebhookProcessed(attempt.eventId);
      return ok({ ignored: true }, 'Livraison déjà terminée.');
    }

    await prisma.marketplaceDelivery.update({
      where: { id: delivery.id },
      data: {
        status: mapped,
        ...(courierName ? { courierName } : {}),
        ...(mapped === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        ...(mapped === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
      },
    });

    if (mapped === 'DELIVERED') {
      void notify({ userId: delivery.buyerId, category: 'BUSINESS', priority: 'HIGH', title: 'Colis livré', body: `« ${delivery.order.item.title} » a été livré.`, actionUrl: '/marketplace/mine' });
      // Séquestre « paiement à la réception » : la remise vaut confirmation.
      await settleOnDelivery(delivery, 'buyer_confirmed');
    } else if (mapped === 'CANCELLED') {
      for (const oid of [delivery.orderId, ...delivery.extraOrderIds]) {
        await refundEscrowToBuyer(oid, 'delivery_cancelled_by_courier').catch(() => null);
      }
    }
    void recordAudit({ action: 'marketplace.delivery.webhook', entity: 'MarketplaceDelivery', entityId: delivery.id, metadata: { reference, status: mapped }, request });
    await markWebhookProcessed(attempt.eventId);

    return ok({ status: mapped });
  } catch (err) {
    logApiError('/v1/marketplace/deliveries/webhooks/miaride', err);
    return serverError();
  }
}
