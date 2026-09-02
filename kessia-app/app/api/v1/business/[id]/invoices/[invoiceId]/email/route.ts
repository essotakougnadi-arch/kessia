// ============================================================
// KESSIA — POST /api/v1/business/[id]/invoices/[invoiceId]/email  (§7)
// Envoie le devis / la facture (PDF en pièce jointe) par e-mail.
// Fournisseur réel si `RESEND_API_KEY`, sinon SIMULATION journalisée.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireBusinessOwner } from '@/lib/business/access';
import { loadInvoiceDoc, renderInvoicePdf, invoiceFileName } from '@/lib/business/invoice-pdf';
import { sendEmail } from '@/lib/email/email';
import { recordAudit } from '@/lib/audit/audit.service';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { ok, badRequest, notFound, validationError, serverError } from '@/lib/utils/response';
import { formatCurrency } from '@/lib/utils/format';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const schema = z.object({
  to: z.string().email('Adresse e-mail invalide').optional(),
});

export async function POST(request: NextRequest, { params }: { params: { id: string; invoiceId: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const limited = await enforceRateLimit(request, 'business.invoice_email', {
      limit: 10, windowMs: 10 * 60_000, by: auth.userId,
    });
    if (limited) return limited;

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);

    const doc = await loadInvoiceDoc(params.id, params.invoiceId);
    if (!doc) return notFound('Document introuvable.');

    const to = parsed.data.to ?? doc.customerEmail ?? undefined;
    if (!to) return badRequest('Aucune adresse e-mail : renseignez celle du client ou passez-la en paramètre.');

    const isQuote = doc.kind === 'QUOTE';
    const label = isQuote ? 'Devis' : 'Facture';
    const pdf = renderInvoicePdf(doc);

    const result = await sendEmail({
      to,
      subject: `${label} ${doc.number} — ${doc.business.name}`,
      text:
        `Bonjour,\n\nVeuillez trouver ci-joint ${isQuote ? 'le devis' : 'la facture'} ${doc.number} ` +
        `d'un montant de ${formatCurrency(doc.total)}.\n\n${doc.business.name}\n${doc.business.owner}`,
      attachments: [{ filename: invoiceFileName(doc), content: pdf, contentType: 'application/pdf' }],
    });

    void recordAudit({
      userId: auth.userId,
      action: 'business.invoice_emailed',
      entity: 'Invoice',
      entityId: doc.id,
      metadata: {
        businessId: params.id,
        number: doc.number,
        toDomain: to.split('@')[1] ?? null,
        provider: result.provider,
        simulated: result.simulated,
        sent: result.sent,
      },
      request,
    });

    if (!result.sent) {
      return serverError(`L'envoi a échoué (${result.detail ?? 'erreur fournisseur'}).`);
    }

    return ok(
      { sent: true, simulated: result.simulated, to },
      result.simulated
        ? `Envoi simulé enregistré (aucun fournisseur e-mail configuré). Destinataire : ${to}.`
        : `${label} envoyé${isQuote ? '' : 'e'} à ${to}.`
    );
  } catch (e) {
    logApiError('/v1/business/[id]/invoices/[invoiceId]/email', e);
    return serverError();
  }
}
