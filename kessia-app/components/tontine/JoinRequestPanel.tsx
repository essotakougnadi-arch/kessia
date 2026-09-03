'use client';
// ============================================================
// KESSIA — Panneau « Demander à rejoindre » (candidat)
// Affiché sur le détail d'une tontine publique quand
// l'utilisateur n'en est pas encore membre.
// ============================================================

import { useState } from 'react';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import type { TontineDetail } from '@/hooks/useTontineDetail';
import styles from './JoinRequestPanel.module.css';

interface Props {
  tontine: TontineDetail;
  requestJoin: (message?: string) => Promise<{ success: boolean; message: string }>;
  cancelJoinRequest: () => Promise<{ success: boolean; message: string }>;
}

export function JoinRequestPanel({ tontine, requestJoin, cancelJoinRequest }: Props) {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const jr = tontine.myJoinRequest;
  const seatsLeft = tontine.maxMembers - tontine.memberCount;
  const isOpen = tontine.isPublic && tontine.status === 'PENDING' && seatsLeft > 0;

  async function send() {
    setBusy(true);
    const r = await requestJoin(message.trim() || undefined);
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) setMessage('');
  }

  async function cancel() {
    setBusy(true);
    const r = await cancelJoinRequest();
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
  }

  // ── Demande en attente ──
  if (jr?.status === 'PENDING') {
    return (
      <section className={`${styles.panel} ${styles.pending}`}>
        <div className={styles.head}>⏳ {t('tontineJoin.pendingTitle')}</div>
        <p className={styles.text}>{t('tontineJoin.pendingBody')}</p>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={cancel}>
          {t('tontineJoin.cancel')}
        </button>
      </section>
    );
  }

  // ── Non ouverte à la demande ──
  if (!isOpen && jr?.status !== 'REJECTED') {
    return (
      <section className={styles.panel}>
        <div className={styles.head}>🔒 {t('tontineJoin.closedTitle')}</div>
        <p className={styles.text}>
          {seatsLeft <= 0 ? t('tontineJoin.full') : t('tontineJoin.notOpen')}
        </p>
      </section>
    );
  }

  // ── Peut (re)demander ──
  return (
    <section className={styles.panel}>
      <div className={styles.head}>🤝 {t('tontineJoin.title')}</div>

      {jr?.status === 'REJECTED' && (
        <div className={styles.rejected}>
          {t('tontineJoin.rejected')}
          {jr.decisionNote ? ` — « ${jr.decisionNote} »` : ''}
        </div>
      )}

      {tontine.membershipConditions && (
        <div className={styles.conditions}>
          <div className={styles.conditionsLabel}>{t('tontineJoin.conditionsLabel')}</div>
          <p>{tontine.membershipConditions}</p>
        </div>
      )}

      <label className={styles.msgLabel} htmlFor="join-message">
        {t('tontineJoin.messageLabel')}
        <span className="label-hint">{t('tontineJoin.messageOptional')}</span>
      </label>
      <textarea
        id="join-message"
        className={styles.textarea}
        rows={3}
        maxLength={500}
        placeholder={t('tontineJoin.messagePlaceholder')}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <button className="btn btn-primary btn-full" id="btn-request-join" disabled={busy} onClick={send}>
        {busy ? t('tontineJoin.sending') : jr?.status === 'REJECTED' ? t('tontineJoin.resend') : t('tontineJoin.send')}
      </button>
      <p className={styles.hint}>{t('tontineJoin.managerDecides')}</p>
    </section>
  );
}

export default JoinRequestPanel;
