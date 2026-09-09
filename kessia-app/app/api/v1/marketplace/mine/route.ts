// ============================================================
// KESSIA — GET /api/v1/marketplace/mine
// Mes articles en vente + mes achats.
// ============================================================

import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withAuth } from '@/lib/auth/middleware';
import { serializeItem } from '@/lib/marketplace/serialize';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const deliverySelect = {
      id: true, status: true, mode: true, simulated: true, feeAmount: true, feeCurrency: true,
      etaMinutes: true, courierName: true, trackingUrl: true, providerRef: true,
      dropoffAddress: true, pickupLabel: true, sellerReadyAt: true, deliveredAt: true, updatedAt: true,
    } as const;

    const [items, orders, sales] = await Promise.all([
      prisma.marketplaceItem.findMany({
        where: { sellerId: context.userId, status: { not: 'ARCHIVED' } },
        orderBy: { createdAt: 'desc' },
        include: {
          seller: { select: { id: true, firstName: true, lastName: true } },
          business: { select: { id: true, name: true } },
          _count: { select: { orders: true } },
        },
      }),
      prisma.marketplaceOrder.findMany({
        where: { buyerId: context.userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          item: { select: { id: true, title: true, imageUrl: true, pickupZone: true } },
          delivery: { select: deliverySelect },
        },
      }),
      // Ventes du vendeur qui ont une livraison en cours (pour « colis prêt »)
      prisma.marketplaceOrder.findMany({
        where: { item: { sellerId: context.userId }, delivery: { isNot: null } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          item: { select: { id: true, title: true } },
          delivery: { select: deliverySelect },
        },
      }),
    ]);

    const serDelivery = (d: NonNullable<(typeof orders)[number]['delivery']>) => ({
      id: d.id, status: d.status, mode: d.mode, simulated: d.simulated,
      feeAmount: Number(d.feeAmount), feeCurrency: d.feeCurrency, etaMinutes: d.etaMinutes,
      courierName: d.courierName, trackingUrl: d.trackingUrl, providerRef: d.providerRef,
      dropoffAddress: d.dropoffAddress, pickupLabel: d.pickupLabel,
      sellerReadyAt: d.sellerReadyAt, deliveredAt: d.deliveredAt,
    });

    return ok({
      items: items.map((it) => ({ ...serializeItem(it, { includeImage: true }), orderCount: it._count.orders })),
      purchases: orders.map((o) => ({
        id: o.id,
        mode: o.mode,
        status: o.status,
        amount: Number(o.amount),
        currency: o.currency,
        tontineId: o.tontineId,
        createdAt: o.createdAt,
        item: { id: o.item.id, title: o.item.title, hasImage: !!o.item.imageUrl },
        deliverable: o.mode === 'WALLET' && o.status === 'PAID' && !!o.item.pickupZone && !o.delivery,
        pickupMissing: o.mode === 'WALLET' && o.status === 'PAID' && !o.item.pickupZone && !o.delivery,
        delivery: o.delivery ? serDelivery(o.delivery) : null,
      })),
      sales: sales
        .filter((s) => s.delivery)
        .map((s) => ({
          id: s.id,
          item: { title: s.item.title },
          delivery: serDelivery(s.delivery!),
        })),
    });
  } catch (error) {
    logApiError('/v1/marketplace/mine', error);
    return serverError();
  }
}
