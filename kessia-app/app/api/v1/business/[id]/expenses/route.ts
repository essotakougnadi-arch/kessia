// ============================================================
// KESSIA — GET/POST /api/v1/business/[id]/expenses
// Gestion des dépenses d'un business
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { assertOwnership } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, created, notFound, forbidden, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const expenseSchema = z.object({
  category: z.string().min(1, 'Catégorie requise').max(100),
  amount: z.number().positive('Montant invalide'),
  description: z.string().max(300).optional(),
  supplierId: z.string().optional(),
  date: z.string().datetime().optional(),
  receiptUrl: z.string().url().optional(),
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

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where: { businessId: params.id },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
        include: { supplier: { select: { id: true, name: true } } },
      }),
      prisma.expense.count({ where: { businessId: params.id } }),
    ]);

    return ok({
      expenses: expenses.map((e) => ({
        id: e.id, category: e.category, amount: Number(e.amount), description: e.description,
        date: e.date, supplier: e.supplier,
      })),
      meta: { page, limit, total, hasMore: skip + expenses.length < total },
    });
  } catch (error) {
    logApiError('/v1/business/[id]/expenses', error);
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
    const parsed = expenseSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { supplierId, ...rest } = parsed.data;
    if (supplierId) {
      const s = await prisma.supplier.findFirst({ where: { id: supplierId, businessId: params.id }, select: { id: true } });
      if (!s) return notFound('Fournisseur introuvable.');
    }

    const expense = await prisma.expense.create({
      data: {
        ...rest,
        supplierId: supplierId || null,
        businessId: params.id,
        date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
      },
    });

    return created(
      { ...expense, amount: Number(expense.amount) },
      `Dépense de ${Number(expense.amount).toLocaleString('fr-FR')} XOF enregistrée.`
    );
  } catch (error) {
    logApiError('/v1/business/[id]/expenses', error);
    return serverError();
  }
}
