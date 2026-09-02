// ============================================================
// KESSIA — Devis / facture : chargement + rendu PDF serveur (§7)
// ============================================================

import prisma from '@/lib/db/prisma';
import { MiniPdf } from '@/lib/pdf/mini-pdf';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { InvoiceKind, InvoiceStatus } from '@prisma/client';

type Line = { label?: string; name?: string; quantity: number; unitPrice: number; total?: number };

export type InvoiceDoc = {
  id: string;
  kind: InvoiceKind;
  number: string;
  status: InvoiceStatus;
  issuedAt: Date;
  dueDate: Date | null;
  customerName: string | null;
  customerEmail: string | null;
  items: Line[];
  subtotal: number;
  tax: number;
  total: number;
  business: {
    name: string;
    sector: string;
    city: string | null;
    phone: string | null;
    owner: string;
    email: string | null;
  };
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyée',
  PAID: 'Payée',
  OVERDUE: 'En retard',
  CANCELLED: 'Annulée',
};

/** Charge un devis/facture d'une entreprise (null si introuvable). */
export async function loadInvoiceDoc(businessId: string, invoiceId: string): Promise<InvoiceDoc | null> {
  const [inv, business] = await Promise.all([
    prisma.invoice.findFirst({ where: { id: invoiceId, businessId } }),
    prisma.business.findUnique({
      where: { id: businessId },
      select: {
        name: true, sector: true, city: true, phone: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
  ]);
  if (!inv || !business) return null;

  return {
    id: inv.id,
    kind: inv.kind,
    number: inv.invoiceNumber,
    status: inv.status,
    issuedAt: inv.issuedAt,
    dueDate: inv.dueDate,
    customerName: inv.customerName,
    customerEmail: inv.customerEmail,
    items: (inv.items as Line[]) ?? [],
    subtotal: Number(inv.subtotal),
    tax: inv.tax ? Number(inv.tax) : 0,
    total: Number(inv.total),
    business: {
      name: business.name,
      sector: business.sector,
      city: business.city,
      phone: business.phone,
      owner: `${business.user.firstName} ${business.user.lastName}`,
      email: business.user.email,
    },
  };
}

export function invoiceFileName(doc: InvoiceDoc): string {
  const prefix = doc.kind === 'QUOTE' ? 'devis' : 'facture';
  return `${prefix}-${doc.number.replace(/[^A-Za-z0-9-]/g, '')}.pdf`;
}

export function renderInvoicePdf(doc: InvoiceDoc): Uint8Array {
  const isQuote = doc.kind === 'QUOTE';
  const taxRate = doc.subtotal > 0 ? Math.round((doc.tax / doc.subtotal) * 100) : 0;
  const pdf = new MiniPdf(isQuote ? `Devis ${doc.number}` : `Facture ${doc.number}`);

  // En-tête
  pdf.text(doc.business.name, { size: 16, bold: true });
  pdf.text(
    [doc.business.sector, doc.business.city, doc.business.phone].filter(Boolean).join(' · '),
    { size: 9, color: [0.42, 0.38, 0.32], gap: 6 }
  );
  pdf.text(`${isQuote ? 'DEVIS' : 'FACTURE'}  ${doc.number}`, { size: 13, bold: true });
  pdf.hr();

  // Parties
  pdf.text('ÉMIS PAR', { size: 8, bold: true, color: [0.5, 0.46, 0.4] });
  pdf.text(doc.business.name, { size: 10, bold: true });
  pdf.text(doc.business.owner, { size: 9.5 });
  if (doc.business.email) pdf.text(doc.business.email, { size: 9.5, gap: 6 });

  pdf.text(isQuote ? 'DESTINATAIRE' : 'FACTURÉ À', { size: 8, bold: true, color: [0.5, 0.46, 0.4] });
  pdf.text(doc.customerName ?? 'Client', { size: 10, bold: true });
  if (doc.customerEmail) pdf.text(doc.customerEmail, { size: 9.5 });
  pdf.moveDown(6);

  pdf.keyValue('Date d’émission', formatDate(doc.issuedAt));
  if (doc.dueDate) pdf.keyValue(isQuote ? 'Valable jusqu’au' : 'Échéance', formatDate(doc.dueDate));
  pdf.keyValue('Statut', STATUS_LABEL[doc.status]);
  pdf.moveDown(10);

  // Lignes
  pdf.tableRow(
    [
      { text: 'Désignation', width: 0.5 },
      { text: 'Qté', width: 0.13, align: 'right' },
      { text: 'P.U.', width: 0.18, align: 'right' },
      { text: 'Total', width: 0.19, align: 'right' },
    ],
    { header: true }
  );
  for (const it of doc.items) {
    const label = it.label ?? it.name ?? 'Ligne';
    const lineTotal = it.total ?? it.quantity * it.unitPrice;
    pdf.tableRow([
      { text: label, width: 0.5 },
      { text: String(it.quantity), width: 0.13, align: 'right' },
      { text: formatCurrency(it.unitPrice), width: 0.18, align: 'right' },
      { text: formatCurrency(lineTotal), width: 0.19, align: 'right' },
    ]);
  }
  pdf.hr();

  pdf.keyValue('Sous-total', formatCurrency(doc.subtotal));
  if (doc.tax > 0) pdf.keyValue(`TVA (${taxRate} %)`, formatCurrency(doc.tax));
  pdf.keyValue(isQuote ? 'Total estimé' : 'Total TTC', formatCurrency(doc.total), { bold: true, size: 12 });
  pdf.moveDown(18);

  pdf.text(
    isQuote
      ? 'Ce devis est une estimation ; il ne vaut pas facture. Sa validité est indiquée ci-dessus.'
      : 'Document généré via KESSIA Business. Les mentions légales propres à votre activité (numéro fiscal, conditions de paiement…) sont à compléter selon la réglementation applicable.',
    { size: 8, color: [0.5, 0.46, 0.4] }
  );
  pdf.text(`Émis le ${formatDate(doc.issuedAt)} · kessia.app`, { size: 8, color: [0.5, 0.46, 0.4] });

  return pdf.build();
}
