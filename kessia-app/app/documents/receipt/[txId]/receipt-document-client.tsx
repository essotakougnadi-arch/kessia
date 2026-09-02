'use client';
// ============================================================
// KESSIA — Reçu d'opération wallet imprimable (cahier des charges §6.1)
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../../documents.module.css';
import { useAuthStore } from '@/store/authStore';
import { apiGet } from '@/lib/api/client';
import { formatCurrency, formatDate, describeTransaction } from '@/lib/utils/format';
import type { Direction, TransactionType, TransactionStatus } from '@prisma/client';

type Receipt = {
  id: string;
  reference: string;
  type: TransactionType;
  direction: Direction;
  status: TransactionStatus;
  amount: number;
  balanceAfter: number;
  currency: string;
  description: string | null;
  createdAt: string;
  processedAt: string | null;
  account: { name: string; phone: string };
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Confirmée', PENDING: 'En attente', PROCESSING: 'En cours',
  FAILED: 'Échouée', REVERSED: 'Annulée', CANCELLED: 'Annulée',
};

export default function ReceiptDocumentClient({ txId }: { txId: string }) {
  const token = useAuthStore((s) => s.accessToken);
  const [r, setR] = useState<Receipt | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return; // en attente de l'hydratation de la session
    setErr(null);
    apiGet<Receipt>(`/api/v1/wallet/transactions/${txId}`)
      .then(setR)
      .catch(() => setErr('Opération introuvable ou inaccessible.'));
  }, [token, txId]);

  if (err) return <div className={styles.screen}><p className={styles.state}>{err}</p></div>;
  if (!r) return <div className={styles.screen}><p className={styles.state}>Chargement…</p></div>;

  const { label } = describeTransaction(r.type, r.description);
  const fcfa = r.currency === 'XOF' || r.currency === 'XAF' ? 'FCFA' : r.currency;

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href="/wallet" className={styles.back}>← Retour</Link>
        <a
          className={styles.back}
          href={`/api/v1/wallet/transactions/${txId}/pdf`}
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
            <div className={styles.brand}>KESSIA</div>
            <div className={styles.brandSub}>Reçu d’opération</div>
          </div>
          <div className={styles.docType}>
            <div className="t" style={{ fontSize: 18, fontWeight: 900 }}>Reçu</div>
            <div className="n">{r.reference}</div>
          </div>
        </div>

        <div className={styles.parties}>
          <div className={styles.party}>
            <div className={styles.label}>Titulaire du compte</div>
            <div className={styles.name}>{r.account.name}</div>
            <div className={styles.line}>{r.account.phone}</div>
          </div>
          <div className={styles.party}>
            <div className={styles.label}>Opération</div>
            <div className={styles.name}>{label}</div>
            <div className={styles.line}>{STATUS_LABEL[r.status] ?? r.status}</div>
          </div>
        </div>

        <div className={`${styles.amountBig} ${r.direction === 'CREDIT' ? styles.credit : styles.debit}`}>
          {r.direction === 'CREDIT' ? '+' : '−'} {formatCurrency(Math.abs(r.amount))} {fcfa}
        </div>

        <div className={styles.metaRow}>
          <span><b>Date&nbsp;:</b> {formatDate(r.processedAt ?? r.createdAt)}</span>
          <span><b>Solde après opération&nbsp;:</b> {formatCurrency(r.balanceAfter)} {fcfa}</span>
        </div>

        {r.description && (
          <p style={{ fontSize: 12.5, color: '#555', margin: '4px 0 0' }}>{r.description}</p>
        )}

        <div className={styles.foot}>
          Reçu généré automatiquement par KESSIA à partir du journal comptable interne (source de
          vérité). Ce document atteste de l’enregistrement de l’opération dans le wallet ; il ne
          constitue pas une pièce comptable au sens fiscal. Référence : {r.reference}.
        </div>
      </div>
    </div>
  );
}
