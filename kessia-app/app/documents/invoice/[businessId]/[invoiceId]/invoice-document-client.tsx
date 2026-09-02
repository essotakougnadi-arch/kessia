'use client';
// ============================================================
// KESSIA — Devis / Facture imprimable (cahier des charges §7, §43)
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../../../documents.module.css';
import { useAuthStore } from '@/store/authStore';
import { apiGet } from '@/lib/api/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { InvoiceKind, InvoiceStatus } from '@prisma/client';

type Line = { label?: string; name?: string; quantity: number; unitPrice: number; total?: number };
type Doc = {
  kind: InvoiceKind;
  number: string;
  status: InvoiceStatus;
  issuedAt: string;
  dueDate: string | null;
  customerName: string | null;
  customerEmail: string | null;
  items: Line[];
  subtotal: number;
  tax: number;
  total: number;
  business: { name: string; sector: string; city: string | null; phone: string | null; owner: string; email: string | null };
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Brouillon', SENT: 'Envoyée', PAID: 'Payée', OVERDUE: 'En retard', CANCELLED: 'Annulée',
};

export default function InvoiceDocumentClient({ businessId, invoiceId }: { businessId: string; invoiceId: string }) {
  const token = useAuthStore((s) => s.accessToken);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return; // en attente de l'hydratation de la session
    setErr(null);
    apiGet<Doc>(`/api/v1/business/${businessId}/invoices/${invoiceId}`)
      .then(setDoc)
      .catch(() => setErr('Document introuvable ou inaccessible.'));
  }, [token, businessId, invoiceId]);

  if (err) return <div className={styles.screen}><p className={styles.state}>{err}</p></div>;
  if (!doc) return <div className={styles.screen}><p className={styles.state}>Chargement…</p></div>;

  const isQuote = doc.kind === 'QUOTE';
  const taxRate = doc.subtotal > 0 ? Math.round((doc.tax / doc.subtotal) * 100) : 0;

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={`/business/${businessId}?tab=factures`} className={styles.back}>← Retour</Link>
        <a
          className={styles.back}
          href={`/api/v1/business/${businessId}/invoices/${invoiceId}/pdf`}
          target="_blank"
          rel="noreferrer"
        >
          ⬇ PDF
        </a>
        <button className={styles.print} onClick={() => window.print()}>Imprimer</button>
      </div>

      <div className={styles.sheet}>
        <div className={styles.head}>
          <div>
            <div className={styles.brand}>{doc.business.name}</div>
            <div className={styles.brandSub}>
              {doc.business.sector}{doc.business.city ? ` · ${doc.business.city}` : ''}
              {doc.business.phone ? ` · ${doc.business.phone}` : ''}
            </div>
          </div>
          <div className={styles.docType}>
            <div className="t" style={{ fontSize: 18, fontWeight: 900 }}>{isQuote ? 'Devis' : 'Facture'}</div>
            <div className="n">{doc.number}</div>
          </div>
        </div>

        <div className={styles.parties}>
          <div className={styles.party}>
            <div className={styles.label}>Émis par</div>
            <div className={styles.name}>{doc.business.name}</div>
            <div className={styles.line}>{doc.business.owner}</div>
            {doc.business.email && <div className={styles.line}>{doc.business.email}</div>}
          </div>
          <div className={styles.party}>
            <div className={styles.label}>{isQuote ? 'Destinataire' : 'Facturé à'}</div>
            <div className={styles.name}>{doc.customerName ?? 'Client'}</div>
            {doc.customerEmail && <div className={styles.line}>{doc.customerEmail}</div>}
          </div>
        </div>

        <div className={styles.metaRow}>
          <span><b>Date&nbsp;:</b> {formatDate(doc.issuedAt)}</span>
          {doc.dueDate && <span><b>{isQuote ? 'Valable jusqu’au' : 'Échéance'}&nbsp;:</b> {formatDate(doc.dueDate)}</span>}
          <span><b>Statut&nbsp;:</b> {STATUS_LABEL[doc.status]}</span>
        </div>

        <table className="lines">
          <thead>
            <tr>
              <th>Désignation</th>
              <th className="r">Qté</th>
              <th className="r">P.U.</th>
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((it, i) => {
              const label = it.label ?? it.name ?? 'Ligne';
              const lineTotal = it.total ?? it.quantity * it.unitPrice;
              return (
                <tr key={i}>
                  <td>{label}</td>
                  <td className="r">{it.quantity}</td>
                  <td className="r">{formatCurrency(it.unitPrice)}</td>
                  <td className="r">{formatCurrency(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className={styles.totals}>
          <div className="row"><span>Sous-total</span><span>{formatCurrency(doc.subtotal)}</span></div>
          {doc.tax > 0 && <div className="row"><span>TVA ({taxRate}&nbsp;%)</span><span>{formatCurrency(doc.tax)}</span></div>}
          <div className="row grand"><span>{isQuote ? 'Total estimé' : 'Total TTC'}</span><span>{formatCurrency(doc.total)}</span></div>
        </div>

        <div className={styles.foot}>
          {isQuote
            ? 'Ce devis est une estimation ; il ne vaut pas facture. Sa validité est indiquée ci-dessus.'
            : 'Document généré via KESSIA Business. Les mentions légales propres à votre activité (numéro fiscal, conditions de paiement…) sont à compléter selon la réglementation applicable.'}
          {' '}Émis le {formatDate(doc.issuedAt)}.
        </div>
      </div>
    </div>
  );
}
