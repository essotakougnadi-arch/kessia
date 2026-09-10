// ============================================================
// KESSIA — /api/v1/marketplace/deliveries/[id]
//   GET  : état détaillé (acheteur ou vendeur)
//   POST : { action } advance | ready | confirm | cancel | tracking
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { withAuth } from '@/lib/auth/middleware';
import { trackingCodeSchema } from '@/lib/validations/marketplace';
import {
  activateScheduledDelivery,
  advanceSimulatedDelivery,
  attachTracking,
  cancelDelivery,
  confirmDelivered,
  markSellerReady,
} from '@/lib/delivery';
import { ok, badRequest, conflict, forbidden, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('advance') }),
  z.object({ action: z.literal('activate') }),
  z.object({ action: z.literal('ready') }),
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('tracking'), code: trackingCodeSchema.shape.code }),
]);

function serialize(d: Awaited<ReturnType<typeof loadFull>>) {
  if (!d) return null;
  return {
    id: d.id,
    orderId: d.orderId,
    extraOrderIds: d.extraOrderIds,
    provider: d.provider,
    mode: d.mode,
    status: d.status,
    simulated: d.simulated,
    pickupLabel: d.pickupLabel,
    dropoffAddress: d.dropoffAddress,
    dropoffArea: d.dropoffArea,
    recipientPhone: d.recipientPhone,
    feeAmount: Number(d.feeAmount),
    feeCurrency: d.feeCurrency,
    etaMinutes: d.etaMinutes,
    providerRef: d.providerRef,
    trackingUrl: d.trackingUrl,
    courierName: d.courierName,
    sellerReadyAt: d.sellerReadyAt,
    deliveredAt: d.deliveredAt,
    cancelledAt: d.cancelledAt,
    requestedAt: d.requestedAt,
    updatedAt: d.updatedAt,
    item: { title: d.order.item.title, imageUrl: d.order.item.imageUrl },
  };
}

function loadFull(id: string) {
  return prisma.marketplaceDelivery.findUnique({
    where: { id },
    include: { order: { include: { item: { select: { title: true, imageUrl: true, sellerId: true } } } } },
  });
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const d = await loadFull(params.id);
    if (!d) return notFound('Livraison introuvable.');
    const isBuyer = d.buyerId === context.userId;
    const isSeller = d.order.item.sellerId === context.userId;
    if (!isBuyer && !isSeller) return forbidden();

    return ok({ ...serialize(d), role: isBuyer ? 'buyer' : 'seller' });
  } catch (err) {
    logApiError('/v1/marketplace/deliveries/[id] GET', err);
    return serverError();
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const body = parsed.data;

    const result =
      body.action === 'advance' ? await advanceSimulatedDelivery(params.id)
      : body.action === 'activate' ? await activateScheduledDelivery(params.id, context.userId)
      : body.action === 'ready' ? await markSellerReady(params.id, context.userId)
      : body.action === 'confirm' ? await confirmDelivered(params.id, context.userId)
      : body.action === 'cancel' ? await cancelDelivery(params.id, context.userId)
      : await attachTracking(params.id, context.userId, body.code);

    if (!result.ok) {
      switch (result.code) {
        case 'NOT_FOUND': return notFound(result.error);
        case 'FORBIDDEN': return forbidden(result.error);
        case 'CONFLICT': return conflict(result.error);
        default: return badRequest(result.error);
      }
    }

    const full = await loadFull(params.id);
    return ok(
      { ...serialize(full), handoffUrl: 'handoffUrl' in result ? result.handoffUrl ?? null : null },
      'Livraison mise à jour.',
    );
  } catch (err) {
    logApiError('/v1/marketplace/deliveries/[id] POST', err);
    return serverError();
  }
}
