// ============================================================
// KESSIA — GET/PATCH/DELETE /api/v1/business/[id]/customers/[customerId]
// Fiche client : coordonnées, notes, relance, historique d'achats (§7).
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { requireBusinessOwner } from '@/lib/business/access';
import { customerSegment } from '@/lib/business/crm';
import { ok, badRequest, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  type: z.enum(['PROSPECT', 'CLIENT']).optional(),
  phone: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
  followUpNote: z.string().max(300).optional().or(z.literal('')),
});

type Params = { params: { id: string; customerId: string } };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const c = await prisma.customer.findFirst({
      where: { id: params.customerId, businessId: params.id },
      include: {
        sales: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: { items: { include: { product: { select: { name: true } } } } },
        },
        invoices: { orderBy: { issuedAt: 'desc' }, take: 20 },
      },
    });
    if (!c) return notFound('Client introuvable.');

    const orderCount = c.sales.length;
    const totalSpent = c.sales.reduce((s, x) => s + Number(x.totalAmount), 0);
    const lastOrderAt = c.sales[0]?.createdAt ?? null;

    return ok({
      id: c.id, name: c.name, type: c.type, phone: c.phone, email: c.email,
      address: c.address, notes: c.notes, nextFollowUpAt: c.nextFollowUpAt, followUpNote: c.followUpNote,
      createdAt: c.createdAt,
      stats: { orderCount, totalSpent, lastOrderAt, avgOrder: orderCount ? Math.round(totalSpent / orderCount) : 0 },
      segment: customerSegment({ type: c.type, orderCount, lastOrderAt }),
      sales: c.sales.map((s) => ({
        id: s.id, total: Number(s.totalAmount), createdAt: s.createdAt, method: s.paymentMethod,
        items: s.items.map((i) => `${i.quantity}× ${i.product.name}`),
      })),
      invoices: c.invoices.map((i) => ({
        id: i.id, number: i.invoiceNumber, kind: i.kind, total: Number(i.total), status: i.status, issuedAt: i.issuedAt,
      })),
    });
  } catch (e) {
    logApiError('/v1/business/[id]/customers/[customerId]', e);
    return serverError();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const exists = await prisma.customer.findFirst({
      where: { id: params.customerId, businessId: params.id }, select: { id: true },
    });
    if (!exists) return notFound('Client introuvable.');

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;

    const data: Record<string, unknown> = {};
    if (d.name !== undefined) data.name = d.name;
    if (d.type !== undefined) data.type = d.type;
    if (d.phone !== undefined) data.phone = d.phone || null;
    if (d.email !== undefined) data.email = d.email || null;
    if (d.address !== undefined) data.address = d.address || null;
    if (d.notes !== undefined) data.notes = d.notes || null;
    if (d.followUpNote !== undefined) data.followUpNote = d.followUpNote || null;
    if (d.nextFollowUpAt !== undefined) {
      data.nextFollowUpAt = d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null;
      // Nouvelle échéance → la relance pourra être notifiée à nouveau (§7).
      data.followUpNotifiedAt = null;
    }

    await prisma.customer.update({ where: { id: params.customerId }, data });
    return ok(null, 'Fiche client mise à jour.');
  } catch (e) {
    logApiError('/v1/business/[id]/customers/[customerId]', e);
    return serverError();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const c = await prisma.customer.findFirst({
      where: { id: params.customerId, businessId: params.id },
      include: { _count: { select: { sales: true, invoices: true } } },
    });
    if (!c) return notFound('Client introuvable.');
    if (c._count.sales > 0 || c._count.invoices > 0) {
      return badRequest('Ce client a des ventes ou factures : passez-le en « inactif » plutôt que de le supprimer.');
    }
    await prisma.customer.delete({ where: { id: params.customerId } });
    return ok(null, 'Client supprimé.');
  } catch (e) {
    logApiError('/v1/business/[id]/customers/[customerId]', e);
    return serverError();
  }
}
