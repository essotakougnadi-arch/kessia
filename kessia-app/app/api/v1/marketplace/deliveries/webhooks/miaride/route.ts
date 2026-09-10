// ============================================================
// KESSIA — POST /api/v1/marketplace/deliveries/webhooks/miaride
// Notifications de statut du partenaire coursier (ADR 0042).
//
// Sécurité : HMAC-SHA256 du corps brut, header `x-miaride-signature`,
// clé `MIARIDE_WEBHOOK_SECRET`. Sans secret configuré (démo), on
// accepte mais on le trace — l'endpoint est l'interface réelle,
// prête pour le jour du partenariat.
// ============================================================

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { settleOnDelivery } from '@/lib/delivery';
import { refundEscrowToBuyer } from '@/lib/marketplace/escrow';
import { notify } from '@/lib/notifications/notify';
import { recordAudit } from '@/lib/audit/audit.service';
import { enforceRateLimit } from '@/lib/security/rate-limit';
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

function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.MIARIDE_WEBHOOK_SECRET;
  if (!secret) return true; // démo : accepté + tracé
  if (!header) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, 'marketplace.delivery.webhook', { limit: 120, windowMs: 60_000 });
    if (limited) return limited;

    const raw = await request.text();
    if (!verifySignature(raw, request.headers.get('x-miaride-signature'))) {
      return unauthorized('Signature Miaride invalide.');
    }

    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return badRequest('Corps JSON invalide.'); }
    const parsed = eventSchema.safeParse(payload);
    if (!parsed.success) return badRequest('Événement mal formé.');
    const { reference, status, courierName } = parsed.data;

    const mapped = EXTERNAL_STATUS[status.toLowerCase()];
    if (!mapped) return badRequest(`Statut inconnu : ${status}`);

    const delivery = await prisma.marketplaceDelivery.findFirst({
      where: { providerRef: reference },
      include: { order: { include: { item: { select: { title: true } } } } },
    });
    if (!delivery) return notFound('Livraison introuvable pour cette référence.');
    if (delivery.status === 'DELIVERED' || delivery.status === 'CANCELLED') {
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

    return ok({ status: mapped });
  } catch (err) {
    logApiError('/v1/marketplace/deliveries/webhooks/miaride', err);
    return serverError();
  }
}
