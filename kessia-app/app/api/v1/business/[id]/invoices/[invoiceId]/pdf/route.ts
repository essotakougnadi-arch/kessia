// ============================================================
// KESSIA — GET /api/v1/business/[id]/invoices/[invoiceId]/pdf  (§7)
// Devis / facture en PDF (généré côté serveur, sans navigateur).
// ============================================================

import { NextRequest } from 'next/server';
import { requireBusinessOwner } from '@/lib/business/access';
import { loadInvoiceDoc, renderInvoicePdf, invoiceFileName } from '@/lib/business/invoice-pdf';
import { notFound, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string; invoiceId: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const doc = await loadInvoiceDoc(params.id, params.invoiceId);
    if (!doc) return notFound('Document introuvable.');

    const pdf = renderInvoicePdf(doc);
    return new Response(pdf as BodyInit, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${invoiceFileName(doc)}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (e) {
    logApiError('/v1/business/[id]/invoices/[invoiceId]/pdf', e);
    return serverError();
  }
}
