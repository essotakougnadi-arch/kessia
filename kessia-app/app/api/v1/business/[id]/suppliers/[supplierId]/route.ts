// ============================================================
// KESSIA — GET/PATCH/DELETE /api/v1/business/[id]/suppliers/[supplierId]
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { requireBusinessOwner } from '@/lib/business/access';
import { ok, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  category: z.string().max(80).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

type Params = { params: { id: string; supplierId: string } };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const s = await prisma.supplier.findFirst({
      where: { id: params.supplierId, businessId: params.id },
      include: { expenses: { orderBy: { date: 'desc' }, take: 30 } },
    });
    if (!s) return notFound('Fournisseur introuvable.');

    const spent = s.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    return ok({
      id: s.id, name: s.name, category: s.category, phone: s.phone, email: s.email,
      address: s.address, notes: s.notes, createdAt: s.createdAt,
      totalSpent: spent, expenseCount: s.expenses.length,
      expenses: s.expenses.map((e) => ({
        id: e.id, category: e.category, amount: Number(e.amount), description: e.description, date: e.date,
      })),
    });
  } catch (e) {
    logApiError('/v1/business/[id]/suppliers/[supplierId]', e);
    return serverError();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const exists = await prisma.supplier.findFirst({
      where: { id: params.supplierId, businessId: params.id }, select: { id: true },
    });
    if (!exists) return notFound('Fournisseur introuvable.');

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;
    const data: Record<string, unknown> = {};
    for (const k of ['name', 'category', 'phone', 'email', 'address', 'notes'] as const) {
      if (d[k] !== undefined) data[k] = d[k] || null;
    }
    if (d.name !== undefined) data.name = d.name;

    await prisma.supplier.update({ where: { id: params.supplierId }, data });
    return ok(null, 'Fournisseur mis à jour.');
  } catch (e) {
    logApiError('/v1/business/[id]/suppliers/[supplierId]', e);
    return serverError();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const s = await prisma.supplier.findFirst({
      where: { id: params.supplierId, businessId: params.id }, select: { id: true },
    });
    if (!s) return notFound('Fournisseur introuvable.');
    // Les dépenses liées sont conservées (supplierId passe à null)
    await prisma.supplier.delete({ where: { id: params.supplierId } });
    return ok(null, 'Fournisseur supprimé.');
  } catch (e) {
    logApiError('/v1/business/[id]/suppliers/[supplierId]', e);
    return serverError();
  }
}
