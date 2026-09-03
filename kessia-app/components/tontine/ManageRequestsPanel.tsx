'use client';
// ============================================================
// KESSIA — Panneau « Demandes d'adhésion » (gestionnaire)
// Liste les demandes en attente + accepter / refuser.
// ============================================================

import { useState } from 'react';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import { useJoinRequests, type JoinRequestRow } from '@/hooks/useJoinRequests';
import type { TFunction } from '@/lib/i18n';
import { formatRelativeDate, initials } from '@/lib/utils/format';
import styles from './ManageRequestsPanel.module.css';

const KYC_TONE: Record<string, string> = {
  VERIFIED: styles.kycOk,
  UNDER_REVIEW: styles.kycMid,
  IN_PROGRESS: styles.kycMid,
  ACTION_REQUIRED: styles.kycMid,
};

function Row({
  r,
  onDecide,
  t,
}: {
  r: JoinRequestRow;
  onDecide: (id: string, action: 'approve' | 'reject', note?: string) => Promise<{ success: boolean; message: string }>;
  t: TFunction;
}) {
  const [first, ...rest] = r.user.name.split(' ');
  const addToast = useUiStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  async function act(action: 'approve' | 'reject') {
    setBusy(true);
    const res = await onDecide(r.id, action, action === 'reject' ? note.trim() || undefined : undefined);
    setBusy(false);
    addToast({ type: res.success ? 'success' : 'error', message: res.message });
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowTop}>
        <div className={styles.avatar}>{initials(first, rest.join(' '))}</div>
        <div className={styles.who}>
          <div className={styles.name}>
            {r.user.name}
            <span className={`${styles.kyc} ${KYC_TONE[r.user.kycStatus] ?? styles.kycNone}`}>
              {t(`kycStatus.${r.user.kycStatus}`, r.user.kycStatus)}
            </span>
          </div>
          <div className={styles.meta}>
            {r.user.phone}
            {r.user.city ? ` · ${r.user.city}` : ''}
            {` · ${formatRelativeDate(r.createdAt)}`}
          </div>
        </div>
      </div>

      {r.message && <p className={styles.message}>« {r.message} »</p>}

      {rejecting ? (
        <div className={styles.rejectBox}>
          <textarea
            className={styles.noteInput}
            rows={2}
            maxLength={500}
            placeholder={t('tontineRequests.rejectNotePlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className={styles.actions}>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setRejecting(false)}>
              {t('common.cancel')}
            </button>
            <button className={`btn btn-sm ${styles.rejectBtn}`} disabled={busy} onClick={() => act('reject')}>
              {t('tontineRequests.confirmReject')}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setRejecting(true)}>
            {t('tontineRequests.reject')}
          </button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act('approve')}>
            {busy ? t('tontineRequests.working') : t('tontineRequests.approve')}
          </button>
        </div>
      )}
    </div>
  );
}

export function ManageRequestsPanel({ tontineId, enabled }: { tontineId: string; enabled: boolean }) {
  const t = useT();
  const { requests, isLoading, decide } = useJoinRequests(tontineId, enabled);

  if (!enabled) return null;
  if (!isLoading && requests.length === 0) return null;

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>
        {t('tontineRequests.title')}
        {requests.length > 0 && <span className={styles.count}>{requests.length}</span>}
      </h2>
      {isLoading && <div className={styles.loading}>{t('common.loading')}</div>}
      <div className={styles.list}>
        {requests.map((r) => (
          <Row key={r.id} r={r} onDecide={decide} t={t} />
        ))}
      </div>
    </section>
  );
}

export default ManageRequestsPanel;
