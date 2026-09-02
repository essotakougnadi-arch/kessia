// ============================================================
// KESSIA — GET/POST /api/v1/business/[id]/invoices
// Facturation (cahier des charges §7, §43)
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth, assertOwnership } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { recordAudit } from '@/lib/audit/audit.service';
import { ok, created, notFound, forbidden, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const lineSchema = z.object({
  label: z.string().min(1).max(200),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});

const invoiceSchema = z.object({
  kind: z.enum(['QUOTE', 'INVOICE']).default('INVOICE'),
  customerName: z.string().min(1, 'Nom du client requis').max(150),
  customerEmail: z.string().email().optional().or(z.literal('')),
  customerId: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'Au moins une ligne'),
  taxRate: z.number().min(0).max(100).default(0),
  dueDate: z.string().datetime().optional(),
  status: z.enum(['DRAFT', 'SENT']).default('DRAFT'),
});

const KIND_PREFIX = { QUOTE: 'DEV', INVOICE: 'FAC' } as const;

async function ownedBusiness(id: string, userId: string, role: string) {
  const business = await prisma.business.findUnique({ where: { id }, select: { userId: true } });
  if (!business) return { error: 'notfound' as const };
  if (!assertOwnership({ userId, role: role as never, phone: '' }, business.userId)) {
    return { error: 'forbidden' as const };
  }
  return { error: null };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const own = await ownedBusiness(params.id, context.userId, context.role);
    if (own.error === 'notfound') return notFound('Business introuvable.');
    if (own.error === 'forbidden') return forbidden();

    const invoices = await prisma.invoice.findMany({
      where: { businessId: params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return ok(
      invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        kind: i.kind,
        customerName: i.customerName,
        status: i.status,
        dueDate: i.dueDate,
        issuedAt: i.issuedAt,
        convertedInvoiceId: i.convertedInvoiceId,
        subtotal: Number(i.subtotal),
        tax: i.tax ? Number(i.tax) : 0,
        total: Number(i.total),
      }))
    );
  } catch (e) {
    logApiError('/v1/business/[id]/invoices', e);
    return serverError();
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const own = await ownedBusiness(params.id, context.userId, context.role);
    if (own.error === 'notfound') return notFound('Business introuvable.');
    if (own.error === 'forbidden') return forbidden();

    const parsed = invoiceSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { kind, customerName, customerEmail, customerId, lines, taxRate, dueDate, status } = parsed.data;

    const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const tax = Math.round((subtotal * taxRate) / 100);
    const total = subtotal + tax;

    // Numéro : DEV/FAC-YYYY-#### (séquence par business, par type et par an)
    const year = new Date().getFullYear();
    const countThisYear = await prisma.invoice.count({
      where: { businessId: params.id, kind, issuedAt: { gte: new Date(year, 0, 1) } },
    });
    const invoiceNumber = `${KIND_PREFIX[kind]}-${year}-${String(countThisYear + 1).padStart(4, '0')}`;

    const invoice = await prisma.invoice.create({
      data: {
        businessId: params.id,
        invoiceNumber,
        kind,
        customerId: customerId || null,
        customerName,
        customerEmail: customerEmail || null,
        items: lines,
        subtotal,
        tax,
        total,
        status,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    void recordAudit({
      userId: context.userId,
      action: kind === 'QUOTE' ? 'business.quote_created' : 'business.invoice_created',
      entity: 'Invoice',
      entityId: invoice.id,
      metadata: { businessId: params.id, invoiceNumber, total, status },
      request,
    });

    return created(
      { id: invoice.id, invoiceNumber, total, status: invoice.status, kind },
      `${kind === 'QUOTE' ? 'Devis' : 'Facture'} ${invoiceNumber} créé (${total.toLocaleString('fr-FR')} XOF).`
    );
  } catch (e) {
    logApiError('/v1/business/[id]/invoices', e);
    return serverError();
  }
}
