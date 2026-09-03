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

    const [items, orders] = await Promise.all([
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
        include: { item: { select: { id: true, title: true, imageUrl: true } } },
      }),
    ]);

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
      })),
    });
  } catch (error) {
    logApiError('/v1/marketplace/mine', error);
    return serverError();
  }
}
