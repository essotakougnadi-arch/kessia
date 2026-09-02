// ============================================================
// KESSIA — GET/POST /api/v1/business/[id]/products
// Gestion des produits d'un business
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { assertOwnership } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, created, notFound, forbidden, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const productSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(150),
  description: z.string().max(500).optional(),
  price: z.number().positive('Prix invalide'),
  cost: z.number().positive().optional(),
  stock: z.number().int().min(0).default(0),
  category: z.string().max(100).optional(),
  image: z.string().url().optional(),
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

    const products = await prisma.product.findMany({
      where: { businessId: params.id, isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    return ok(
      products.map((p) => ({
        ...p,
        price: Number(p.price),
        cost: p.cost ? Number(p.cost) : null,
      }))
    );
  } catch (error) {
    logApiError('/v1/business/[id]/products', error);
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
    const parsed = productSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const product = await prisma.product.create({
      data: {
        ...parsed.data,
        businessId: params.id,
      },
    });

    return created(
      { ...product, price: Number(product.price), cost: product.cost ? Number(product.cost) : null },
      `Produit "${product.name}" ajouté avec succès.`
    );
  } catch (error) {
    logApiError('/v1/business/[id]/products', error);
    return serverError();
  }
}
