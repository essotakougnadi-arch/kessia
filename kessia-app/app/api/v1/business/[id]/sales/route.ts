// ============================================================
// KESSIA — GET/POST /api/v1/business/[id]/sales
// Gestion des ventes d'un business
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { assertOwnership } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, created, notFound, forbidden, validationError, serverError, badRequest } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const saleItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

const createSaleSchema = z.object({
  customerId: z.string().optional(),
  items: z.array(saleItemSchema).min(1, 'Au moins un article requis'),
  paymentMethod: z.enum(['CASH', 'MOBILE_MONEY', 'BANK', 'CREDIT']).optional(),
  notes: z.string().max(300).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const business = await prisma.business.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });

    if (!business) return notFound('Business introuvable.');
    if (!assertOwnership(context, business.userId)) return forbidden();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20'));
    const skip = (page - 1) * limit;

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where: { businessId: params.id },
        include: {
          customer: { select: { id: true, name: true } },
          items: {
            include: { product: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where: { businessId: params.id } }),
    ]);

    return ok({
      sales: sales.map((s) => ({
        ...s,
        totalAmount: Number(s.totalAmount),
        items: s.items.map((i) => ({
          ...i,
          unitPrice: Number(i.unitPrice),
          totalPrice: Number(i.totalPrice),
        })),
      })),
      meta: { page, limit, total, hasMore: skip + sales.length < total },
    });
  } catch (error) {
    logApiError('/v1/business/[id]/sales', error);
    return serverError();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const business = await prisma.business.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });

    if (!business) return notFound('Business introuvable.');
    if (!assertOwnership(context, business.userId)) return forbidden();

    const body = await request.json();
    const parsed = createSaleSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { items, customerId, paymentMethod, notes } = parsed.data;

    if (customerId) {
      const c = await prisma.customer.findFirst({ where: { id: customerId, businessId: params.id }, select: { id: true } });
      if (!c) return badRequest('Client introuvable pour cette entreprise.');
    }

    // Vérifier que tous les produits existent et ont assez de stock
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, businessId: params.id, isActive: true },
    });

    if (products.length !== productIds.length) {
      return badRequest('Un ou plusieurs produits sont introuvables ou inactifs.');
    }

    // Vérifier le stock
    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (product && product.stock < item.quantity) {
        return badRequest(`Stock insuffisant pour "${product.name}". Stock disponible: ${product.stock}`);
      }
    }

    // Calculer le total
    const totalAmount = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    // Créer la vente et mettre à jour le stock
    const sale = await prisma.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          businessId: params.id,
          customerId,
          totalAmount,
          paymentMethod,
          notes,
          status: 'COMPLETED',
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.unitPrice * item.quantity,
            })),
          },
        },
        include: { items: true },
      });

      // Décrémenter le stock de chaque produit
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: 'OUT',
            quantity: item.quantity,
            reason: `Vente #${newSale.id.slice(-6)}`,
          },
        });
      }

      return newSale;
    });

    return created(
      {
        id: sale.id,
        totalAmount: Number(sale.totalAmount),
        itemsCount: sale.items.length,
      },
      `Vente de ${totalAmount.toLocaleString('fr-FR')} XOF enregistrée.`
    );
  } catch (error) {
    logApiError('/v1/business/[id]/sales', error);
    return serverError();
  }
}
