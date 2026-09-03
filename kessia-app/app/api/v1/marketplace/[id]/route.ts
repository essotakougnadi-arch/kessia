// ============================================================
// KESSIA — GET/PATCH/DELETE /api/v1/marketplace/[id]
//  GET    : détail public
//  PATCH  : modification (vendeur)
//  DELETE : archivage (vendeur)
// ============================================================

import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withAuth } from '@/lib/auth/middleware';
import { updateItemSchema } from '@/lib/validations/marketplace';
import { serializeItem } from '@/lib/marketplace/serialize';
import { installmentAmount } from '@/lib/marketplace/marketplace';
import { ok, notFound, forbidden, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const item = await prisma.marketplaceItem.findUnique({
      where: { id: params.id },
      include: {
        seller: { select: { id: true, firstName: true, lastName: true } },
        business: { select: { id: true, name: true } },
      },
    });
    if (!item || item.status === 'ARCHIVED') return notFound('Article introuvable.');

    return ok({
      ...serializeItem(item, { includeImage: true }),
      tontineInstallmentAmount: item.payableByTontine && item.tontineInstallments
        ? installmentAmount(Number(item.price), item.tontineInstallments)
        : null,
    });
  } catch (error) {
    logApiError('/v1/marketplace/[id]', error);
    return serverError();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const item = await prisma.marketplaceItem.findUnique({
      where: { id: params.id },
      select: { id: true, sellerId: true, price: true, payableByTontine: true, tontineInstallments: true },
    });
    if (!item) return notFound('Article introuvable.');
    if (item.sellerId !== context.userId) return forbidden('Vous ne pouvez modifier que vos articles.');

    const parsed = updateItemSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;

    const payable = d.payableByTontine ?? item.payableByTontine;
    const installments = payable
      ? (d.tontineInstallments ?? item.tontineInstallments ?? 6)
      : null;

    const updated = await prisma.marketplaceItem.update({
      where: { id: params.id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.category !== undefined ? { category: d.category } : {}),
        ...(d.price !== undefined ? { price: d.price } : {}),
        ...(d.city !== undefined ? { city: d.city } : {}),
        ...(d.imageUrl !== undefined ? { imageUrl: d.imageUrl } : {}),
        ...(d.stock !== undefined ? { stock: d.stock, status: d.stock > 0 ? 'ACTIVE' : 'SOLD_OUT' } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        payableByTontine: payable,
        tontineInstallments: installments,
      },
      include: {
        seller: { select: { id: true, firstName: true, lastName: true } },
        business: { select: { id: true, name: true } },
      },
    });

    return ok(serializeItem(updated, { includeImage: false }), 'Article mis à jour.');
  } catch (error) {
    logApiError('/v1/marketplace/[id]', error);
    return serverError();
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const item = await prisma.marketplaceItem.findUnique({
      where: { id: params.id },
      select: { id: true, sellerId: true },
    });
    if (!item) return notFound('Article introuvable.');
    if (item.sellerId !== context.userId) return forbidden('Vous ne pouvez retirer que vos articles.');

    await prisma.marketplaceItem.update({ where: { id: params.id }, data: { status: 'ARCHIVED' } });
    return ok({ id: params.id, status: 'ARCHIVED' }, 'Article retiré de la vente.');
  } catch (error) {
    logApiError('/v1/marketplace/[id]', error);
    return serverError();
  }
}
