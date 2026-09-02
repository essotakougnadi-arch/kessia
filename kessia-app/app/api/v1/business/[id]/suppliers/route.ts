// ============================================================
// KESSIA — GET/POST /api/v1/business/[id]/suppliers  (§7)
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { requireBusinessOwner } from '@/lib/business/access';
import { ok, created, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().min(2, 'Nom requis').max(120),
  category: z.string().max(80).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const suppliers = await prisma.supplier.findMany({
      where: { businessId: params.id },
      orderBy: { name: 'asc' },
      include: { expenses: { select: { amount: true, date: true } } },
    });

    const rows = suppliers.map((s) => {
      const spent = s.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const lastAt = s.expenses.reduce<Date | null>((l, e) => (!l || e.date > l ? e.date : l), null);
      return {
        id: s.id, name: s.name, category: s.category, phone: s.phone, email: s.email, notes: s.notes,
        expenseCount: s.expenses.length, totalSpent: spent, lastPurchaseAt: lastAt,
      };
    });

    return ok({
      suppliers: rows,
      summary: { total: rows.length, spent: rows.reduce((s, r) => s + r.totalSpent, 0) },
    });
  } catch (e) {
    logApiError('/v1/business/[id]/suppliers', e);
    return serverError();
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { email, ...rest } = parsed.data;

    const s = await prisma.supplier.create({ data: { ...rest, email: email || null, businessId: params.id } });
    return created({ id: s.id }, `Fournisseur « ${s.name} » ajouté.`);
  } catch (e) {
    logApiError('/v1/business/[id]/suppliers', e);
    return serverError();
  }
}
