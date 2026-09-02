// ============================================================
// KESSIA — GET/PATCH /api/v1/business/[id]/invoices/[invoiceId]  (§7)
//   GET                          → document complet (impression / PDF)
//   PATCH { action: 'convert' }  devis → facture
//   PATCH { action: 'status' }   changement de statut
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { requireBusinessOwner } from '@/lib/business/access';
import { recordAudit } from '@/lib/audit/audit.service';
import { ok, badRequest, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string; invoiceId: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const [inv, business] = await Promise.all([
      prisma.invoice.findFirst({ where: { id: params.invoiceId, businessId: params.id } }),
      prisma.business.findUnique({
        where: { id: params.id },
        select: { name: true, sector: true, city: true, phone: true, user: { select: { firstName: true, lastName: true, email: true } } },
      }),
    ]);
    if (!inv || !business) return notFound('Document introuvable.');

    return ok({
      kind: inv.kind,
      number: inv.invoiceNumber,
      status: inv.status,
      issuedAt: inv.issuedAt,
      dueDate: inv.dueDate,
      customerName: inv.customerName,
      customerEmail: inv.customerEmail,
      items: inv.items,
      subtotal: Number(inv.subtotal),
      tax: inv.tax ? Number(inv.tax) : 0,
      total: Number(inv.total),
      convertedInvoiceId: inv.convertedInvoiceId,
      business: {
        name: business.name, sector: business.sector, city: business.city, phone: business.phone,
        owner: `${business.user.firstName} ${business.user.lastName}`,
        email: business.user.email,
      },
    });
  } catch (e) {
    logApiError('/v1/business/[id]/invoices/[invoiceId]', e);
    return serverError();
  }
}

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('convert') }),
  z.object({ action: z.literal('status'), status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']) }),
]);

type Params = { params: { id: string; invoiceId: string } };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const inv = await prisma.invoice.findFirst({ where: { id: params.invoiceId, businessId: params.id } });
    if (!inv) return notFound('Document introuvable.');

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    if (parsed.data.action === 'status') {
      const status = parsed.data.status;
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { status, paidAt: status === 'PAID' ? new Date() : status === 'DRAFT' ? null : inv.paidAt },
      });
      return ok({ status }, 'Statut mis à jour.');
    }

    // convert
    if (inv.kind !== 'QUOTE') return badRequest('Seul un devis peut être converti en facture.');
    if (inv.convertedInvoiceId) return badRequest('Ce devis a déjà été converti.');

    const year = new Date().getFullYear();
    const count = await prisma.invoice.count({
      where: { businessId: params.id, kind: 'INVOICE', issuedAt: { gte: new Date(year, 0, 1) } },
    });
    const invoiceNumber = `FAC-${year}-${String(count + 1).padStart(4, '0')}`;

    const facture = await prisma.$transaction(async (tx) => {
      const f = await tx.invoice.create({
        data: {
          businessId: params.id, invoiceNumber, kind: 'INVOICE',
          customerId: inv.customerId, customerName: inv.customerName, customerEmail: inv.customerEmail,
          items: inv.items as never, subtotal: inv.subtotal, tax: inv.tax, total: inv.total,
          status: 'SENT', dueDate: inv.dueDate,
        },
      });
      await tx.invoice.update({ where: { id: inv.id }, data: { convertedInvoiceId: f.id, status: 'CANCELLED' } });
      return f;
    });

    void recordAudit({
      userId: auth.userId, action: 'business.quote_converted', entity: 'Invoice', entityId: facture.id,
      metadata: { businessId: params.id, quoteId: inv.id, invoiceNumber }, request,
    });

    return ok(
      { invoiceId: facture.id, invoiceNumber },
      `Devis converti en facture ${invoiceNumber}.`
    );
  } catch (e) {
    logApiError('/v1/business/[id]/invoices/[invoiceId]', e);
    return serverError();
  }
}
