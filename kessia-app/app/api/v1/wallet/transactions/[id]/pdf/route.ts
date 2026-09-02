// ============================================================
// KESSIA — GET /api/v1/wallet/transactions/[id]/pdf  (§6.1)
// Reçu d'opération en PDF (généré côté serveur, sans navigateur).
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { loadReceiptDoc, renderReceiptPdf, receiptFileName } from '@/lib/wallet/receipt-pdf';
import { notFound, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const doc = await loadReceiptDoc(context.userId, params.id);
    if (!doc) return notFound('Opération introuvable.');

    const pdf = renderReceiptPdf(doc);
    return new Response(pdf as BodyInit, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${receiptFileName(doc)}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (e) {
    logApiError('/v1/wallet/transactions/[id]/pdf', e);
    return serverError();
  }
}
