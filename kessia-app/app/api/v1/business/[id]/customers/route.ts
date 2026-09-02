// ============================================================
// KESSIA — GET/POST /api/v1/business/[id]/customers  (§7 — CRM)
// Liste segmentée + indicateurs d'achat, création.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { requireBusinessOwner } from '@/lib/business/access';
import { customerSegment } from '@/lib/business/crm';
import { ok, created, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().min(2, 'Nom requis').max(120),
  type: z.enum(['PROSPECT', 'CLIENT']).default('CLIENT'),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const customers = await prisma.customer.findMany({
      where: { businessId: params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        sales: { select: { totalAmount: true, createdAt: true } },
      },
    });

    const now = new Date();
    const rows = customers.map((c) => {
      const orderCount = c.sales.length;
      const totalSpent = c.sales.reduce((s, x) => s + Number(x.totalAmount), 0);
      const lastOrderAt = c.sales.reduce<Date | null>(
        (last, x) => (!last || x.createdAt > last ? x.createdAt : last),
        null
      );
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        phone: c.phone,
        email: c.email,
        notes: c.notes,
        nextFollowUpAt: c.nextFollowUpAt,
        followUpNote: c.followUpNote,
        orderCount,
        totalSpent,
        lastOrderAt,
        segment: customerSegment({ type: c.type, orderCount, lastOrderAt, now }),
      };
    });

    const summary = {
      total: rows.length,
      clients: rows.filter((r) => r.type === 'CLIENT').length,
      prospects: rows.filter((r) => r.type === 'PROSPECT').length,
      followUpsDue: rows.filter((r) => r.nextFollowUpAt && new Date(r.nextFollowUpAt) <= now).length,
      revenue: rows.reduce((s, r) => s + r.totalSpent, 0),
    };

    return ok({ customers: rows, summary });
  } catch (e) {
    logApiError('/v1/business/[id]/customers', e);
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

    const customer = await prisma.customer.create({
      data: { ...rest, email: email || null, businessId: params.id },
    });
    return created({ id: customer.id }, `${customer.type === 'PROSPECT' ? 'Prospect' : 'Client'} « ${customer.name} » ajouté.`);
  } catch (e) {
    logApiError('/v1/business/[id]/customers', e);
    return serverError();
  }
}
