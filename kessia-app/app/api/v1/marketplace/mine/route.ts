// ============================================================
// KESSIA — GET /api/v1/marketplace/mine
// Mes articles en vente + mes achats (+ livraisons, séquestre).
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
      dropoffAddress: true, dropoffArea: true, pickupLabel: true, extraOrderIds: true,
      sellerReadyAt: true, deliveredAt: true, updatedAt: true,
    } as const;

    const [items, orders, sales, myDeliveries] = await Promise.all([
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
          item: { select: { id: true, title: true, imageUrl: true, pickupZone: true, sellerId: true } },
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
      // Livraisons de l'acheteur (pour rattacher les commandes groupées).
      prisma.marketplaceDelivery.findMany({
        where: { buyerId: context.userId },
        select: { id: true, orderId: true, extraOrderIds: true, status: true },
      }),
    ]);

    type Del = NonNullable<(typeof orders)[number]['delivery']>;
    const serDelivery = (d: Del) => ({
      id: d.id, status: d.status, mode: d.mode, simulated: d.simulated,
      feeAmount: Number(d.feeAmount), feeCurrency: d.feeCurrency, etaMinutes: d.etaMinutes,
      courierName: d.courierName, trackingUrl: d.trackingUrl, providerRef: d.providerRef,
      dropoffAddress: d.dropoffAddress, dropoffArea: d.dropoffArea, pickupLabel: d.pickupLabel,
      extraItemCount: d.extraOrderIds.length,
      sellerReadyAt: d.sellerReadyAt, deliveredAt: d.deliveredAt,
    });

    // Commande -> livraison qui la couvre en tant qu'article supplémentaire.
    const coveredBy = new Map<string, { id: string; status: string }>();
    for (const d of myDeliveries) {
      for (const oid of d.extraOrderIds) coveredBy.set(oid, { id: d.id, status: d.status });
    }

    // Statut des tontines Achat liées (pour l'activation des livraisons programmées).
    const tontineIds = orders.map((o) => o.tontineId).filter((v): v is string => !!v);
    const tontineStatus = new Map<string, string>();
    if (tontineIds.length) {
      const tts = await prisma.tontine.findMany({
        where: { id: { in: tontineIds } }, select: { id: true, status: true },
      });
      for (const tt of tts) tontineStatus.set(tt.id, tt.status);
    }

    return ok({
      items: items.map((it) => ({ ...serializeItem(it, { includeImage: true }), orderCount: it._count.orders })),
      purchases: orders.map((o) => {
        const paidWallet = o.mode === 'WALLET' && (o.status === 'PAID' || o.status === 'PENDING_SETTLEMENT');
        const ttStatus = o.tontineId ? tontineStatus.get(o.tontineId) ?? null : null;
        const tontineDone = o.mode === 'TONTINE' && ttStatus === 'COMPLETED';
        const cover = coveredBy.get(o.id) ?? null;
        return {
          id: o.id,
          mode: o.mode,
          status: o.status,
          settlement: o.settlement,
          amount: Number(o.amount),
          currency: o.currency,
          tontineId: o.tontineId,
          tontineStatus: ttStatus,
          createdAt: o.createdAt,
          sellerId: o.item.sellerId,
          item: { id: o.item.id, title: o.item.title, hasImage: !!o.item.imageUrl },
          // Livraison directement demandable.
          deliverable: paidWallet && !!o.item.pickupZone && !o.delivery && !cover,
          pickupMissing: paidWallet && !o.item.pickupZone && !o.delivery && !cover,
          // Achat par tontine : livraison programmable à l'avance.
          scheduleable: o.mode === 'TONTINE' && !!o.item.pickupZone && !o.delivery && !cover,
          // Une livraison SCHEDULED peut-elle être activée maintenant ?
          scheduledActivatable: o.delivery?.status === 'SCHEDULED' && (paidWallet || tontineDone),
          awaitingReceipt: o.status === 'PENDING_SETTLEMENT',
          delivery: o.delivery ? serDelivery(o.delivery) : null,
          coveredByDeliveryId: cover?.id ?? null,
        };
      }),
      sales: sales
        .filter((s) => s.delivery)
        .map((s) => ({
          id: s.id,
          settlement: s.settlement,
          status: s.status,
          item: { title: s.item.title },
          delivery: serDelivery(s.delivery!),
        })),
    });
  } catch (error) {
    logApiError('/v1/marketplace/mine', error);
    return serverError();
  }
}
