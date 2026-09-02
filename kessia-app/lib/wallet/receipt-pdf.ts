// ============================================================
// KESSIA — Reçu d'opération wallet : chargement + rendu PDF (§6.1)
// ============================================================

import prisma from '@/lib/db/prisma';
import { MiniPdf } from '@/lib/pdf/mini-pdf';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { TransactionType, TransactionStatus, Direction } from '@prisma/client';

export type ReceiptDoc = {
  id: string;
  reference: string;
  type: TransactionType;
  direction: Direction;
  status: TransactionStatus;
  amount: number;
  balanceAfter: number;
  currency: string;
  description: string | null;
  createdAt: Date;
  processedAt: Date | null;
  account: { name: string; phone: string };
};

const TYPE_LABEL: Record<TransactionType, string> = {
  DEPOSIT: 'Dépôt',
  WITHDRAWAL: 'Retrait',
  TRANSFER_IN: 'Transfert reçu',
  TRANSFER_OUT: 'Transfert émis',
  TONTINE_CONTRIBUTION: 'Cotisation de tontine',
  TONTINE_PAYOUT: 'Versement de tontine',
  SALE_PAYMENT: 'Encaissement de vente',
  FEE: 'Frais',
  REVERSAL: 'Annulation',
  REFUND: 'Remboursement',
};

const STATUS_LABEL: Record<TransactionStatus, string> = {
  PENDING: 'En attente',
  PROCESSING: 'En cours',
  COMPLETED: 'Confirmée',
  FAILED: 'Échouée',
  REVERSED: 'Annulée',
  CANCELLED: 'Annulée',
};

/** Charge le reçu d'une opération appartenant à l'utilisateur (null sinon). */
export async function loadReceiptDoc(userId: string, entryId: string): Promise<ReceiptDoc | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, phone: true, wallet: { select: { id: true, currency: true } } },
  });
  if (!user?.wallet) return null;

  const entry = await prisma.ledgerEntry.findFirst({ where: { id: entryId, walletId: user.wallet.id } });
  if (!entry) return null;

  return {
    id: entry.id,
    reference: entry.referenceId ?? entry.idempotencyKey ?? entry.id,
    type: entry.type,
    direction: entry.direction,
    status: entry.status,
    amount: Number(entry.amount),
    balanceAfter: Number(entry.balanceAfter),
    currency: user.wallet.currency,
    description: entry.description,
    createdAt: entry.createdAt,
    processedAt: entry.processedAt,
    account: { name: `${user.firstName} ${user.lastName}`, phone: user.phone },
  };
}

export function receiptFileName(doc: ReceiptDoc): string {
  return `recu-kessia-${doc.reference.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40) || doc.id}.pdf`;
}

export function renderReceiptPdf(doc: ReceiptDoc): Uint8Array {
  const sign = doc.direction === 'CREDIT' ? '+' : '-';
  const pdf = new MiniPdf(`Reçu ${doc.reference}`);

  pdf.text('KESSIA', { size: 16, bold: true });
  pdf.text('Reçu d’opération · wallet', { size: 9, color: [0.42, 0.38, 0.32], gap: 6 });
  pdf.hr();

  pdf.text(TYPE_LABEL[doc.type], { size: 12, bold: true });
  pdf.text(`${sign}${formatCurrency(doc.amount, doc.currency)}`, { size: 20, bold: true, gap: 4 });
  pdf.moveDown(8);

  pdf.keyValue('Statut', STATUS_LABEL[doc.status]);
  pdf.keyValue('Date', formatDate(doc.processedAt ?? doc.createdAt));
  pdf.keyValue('Référence', doc.reference);
  if (doc.description) pdf.keyValue('Détail', doc.description);
  pdf.keyValue('Titulaire', doc.account.name);
  pdf.keyValue('Compte', doc.account.phone);
  pdf.keyValue('Solde après opération', formatCurrency(doc.balanceAfter, doc.currency), { bold: true });
  pdf.moveDown(18);

  pdf.text(
    'Reçu généré par KESSIA à partir du registre comptable (ledger). Ce document atteste d’une écriture ; il ne constitue pas un relevé bancaire officiel.',
    { size: 8, color: [0.5, 0.46, 0.4] }
  );
  pdf.text(`Émis le ${formatDate(new Date())} · kessia.app`, { size: 8, color: [0.5, 0.46, 0.4] });

  return pdf.build();
}
