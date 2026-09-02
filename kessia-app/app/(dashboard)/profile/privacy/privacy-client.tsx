'use client';
// ============================================================
// KESSIA — Confidentialité & données personnelles (§4.5, §59)
// Consentements · export de données (portabilité) · suppression de compte
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import styles from './privacy.module.css';
import { useUiStore } from '@/store/uiStore';
import { usePrivacy } from '@/hooks/usePrivacy';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { useT } from '@/lib/i18n';
import { formatDate } from '@/lib/utils/format';

function fmtDate(iso: string | null | undefined): string {
  return iso ? formatDate(iso) : '—';
}

export default function PrivacyClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { status, isLoading, error, refresh, exportData, requestDeletion, cancelDeletion } = usePrivacy();

  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function onExport() {
    setExporting(true);
    const r = await exportData();
    setExporting(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.success ? t('privacyPage.exportStarted') : r.message });
  }

  async function onRequestDeletion() {
    setBusy(true);
    const r = await requestDeletion(reason.trim() || undefined);
    setBusy(false);
    setConfirmDelete(false);
    setReason('');
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
  }

  async function onCancelDeletion() {
    setBusy(true);
    const r = await cancelDeletion();
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
  }

  const deletionPending = !!status?.deletionRequestedAt;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/profile" className={styles.back} aria-label={t('privacyPage.back')}>←</Link>
        <h1 className={styles.title}>{t('privacyPage.title')}</h1>
      </header>

      {error && !isLoading && (
        <ErrorNote message={t('privacyPage.loadError')} onRetry={refresh} />
      )}

      {/* ── Consentements ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('privacyPage.consents')}</h2>
        <p className={styles.sectionDesc}>{t('privacyPage.consentsDesc')}</p>
        {(status?.consents ?? []).map((c) => (
          <div key={c.key} className={styles.consentRow}>
            <div>
              <div className={styles.consentLabel}>{c.label}</div>
              <div className={styles.consentDate}>{t('privacyPage.acceptedOn', { date: fmtDate(c.grantedAt) })}</div>
            </div>
            <span className={styles.granted}>{t('privacyPage.granted')}</span>
          </div>
        ))}
        <p className={styles.sectionDesc} style={{ marginTop: 12, marginBottom: 0 }}>
          <Link href="/legal/privacy" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
            {t('privacyPage.privacyLink')}
          </Link>{' '}·{' '}
          <Link href="/legal/terms" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
            {t('privacyPage.termsLink')}
          </Link>
        </p>
      </section>

      {/* ── Export / portabilité ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('privacyPage.exportTitle')}</h2>
        <p className={styles.sectionDesc}>{t('privacyPage.exportDesc')}</p>
        <p className={styles.sectionDesc} style={{ marginBottom: 6 }}>{t('privacyPage.archiveContains')}</p>
        <ul className={styles.list}>
          {(status?.exportIncludes ?? []).map((x) => <li key={x}>{x}</li>)}
        </ul>
        {status?.dataExportRequestedAt && (
          <p className={styles.sectionDesc} style={{ marginTop: 10 }}>
            {t('privacyPage.lastExport', { date: fmtDate(status.dataExportRequestedAt) })}
          </p>
        )}
        <button
          className="btn btn-primary btn-full"
          style={{ marginTop: 14 }}
          onClick={onExport}
          disabled={exporting || isLoading}
        >
          {exporting ? t('privacyPage.generating') : t('privacyPage.exportBtn')}
        </button>
      </section>

      {/* ── Suppression de compte ── */}
      <section className={`${styles.section} ${styles.danger}`}>
        <h2 className={styles.sectionTitle}>{t('privacyPage.deleteTitle')}</h2>

        {deletionPending ? (
          <>
            <span className={styles.pending}>{t('privacyPage.deletePendingOn', { date: fmtDate(status?.deletionRequestedAt) })}</span>
            <p className={styles.sectionDesc}>{t('privacyPage.deletePendingDesc')}</p>
            <button className="btn btn-ghost btn-full" onClick={onCancelDeletion} disabled={busy}>
              {busy ? t('privacyPage.busy') : t('privacyPage.cancelDeletion')}
            </button>
          </>
        ) : !confirmDelete ? (
          <>
            <p className={styles.sectionDesc}>{t('privacyPage.deleteDesc')}</p>
            <button className="btn btn-danger btn-full" onClick={() => setConfirmDelete(true)}>
              {t('privacyPage.requestDeletion')}
            </button>
          </>
        ) : (
          <div className={styles.form}>
            <p className={styles.note}>{t('privacyPage.deleteWarn')}</p>
            <textarea
              className="input"
              placeholder={t('privacyPage.reasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <button className="btn btn-danger btn-full" onClick={onRequestDeletion} disabled={busy}>
              {busy ? t('privacyPage.busy') : t('privacyPage.confirmDeletion')}
            </button>
            <button className="btn btn-ghost btn-full" onClick={() => { setConfirmDelete(false); setReason(''); }}>
              {t('privacyPage.cancel')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
