// ============================================================
// KESSIA — POST /api/v1/marketplace/deliveries/quote
// Estimation du tarif de livraison Miaride pour une commande.
// ============================================================

import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withAuth } from '@/lib/auth/middleware';
import { deliveryQuoteSchema } from '@/lib/validations/marketplace';
import { estimateFee, findZone } from '@/lib/delivery/zones';
import { getDeliveryProvider } from '@/lib/delivery';
import { ok, notFound, forbidden, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const parsed = deliveryQuoteSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { orderId, dropoffZone } = parsed.data;

    const order = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      select: {
        buyerId: true,
        item: { select: { pickupZone: true, city: true } },
        delivery: { select: { id: true } },
      },
    });
    if (!order) return notFound('Commande introuvable.');
    if (order.buyerId !== context.userId) return forbidden();

    const provider = getDeliveryProvider('MIARIDE');
    const fee = estimateFee(order.item.pickupZone, dropoffZone);
    const pickup = findZone(order.item.pickupZone);

    return ok({
      enabled: provider.enabled,
      alreadyRequested: order.delivery !== null,
      pickupZone: order.item.pickupZone,
      pickupLabel: pickup?.label ?? null,
      pickupMissing: pickup === null,
      covered: fee.covered,
      amount: fee.amount,
      currency: fee.currency,
      etaMinutes: fee.etaMinutes,
      toLabel: fee.toLabel,
    });
  } catch (err) {
    logApiError('/v1/marketplace/deliveries/quote', err);
    return serverError();
  }
}
