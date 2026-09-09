'use client';

import { useState } from 'react';
import styles from '../admin.module.css';
import { kycPill } from '../pills';
import { useAdminUsers, type AdminUserRow } from '@/hooks/useAdmin';
import { useUiStore } from '@/store/uiStore';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatRelativeDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';

const MODERATABLE = new Set(['USER', 'BUSINESS_OWNER', 'TONTINE_MANAGER']);

export default function AdminUsersPage() {
  const t = useT();
  const [q, setQ] = useState('');
  const [kyc, setKyc] = useState('');
  const { data, isLoading, moderate } = useAdminUsers(q, kyc);
  const addToast = useUiStore((s) => s.addToast);

  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const [mode, setMode] = useState<'moderate' | 'erase'>('moderate');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  function openModeration(u: AdminUserRow) { setTarget(u); setMode('moderate'); setReason(''); }
  function openErase(u: AdminUserRow) { setTarget(u); setMode('erase'); setReason(''); }

  async function confirmModeration() {
    if (!target) return;
    setBusy(true);
    const action = mode === 'erase' ? 'erase' : target.isActive ? 'suspend' : 'reactivate';
    const r = await moderate(target.id, action, reason.trim() || undefined);
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) { setTarget(null); setReason(''); }
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>{t('admin.users.title')}</h1>
      <p className={styles.lede}>{data ? t('admin.users.count', { n: data.meta.total }) : '…'}</p>

      <div className={styles.toolbar}>
        <input placeholder={t('admin.users.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={kyc} onChange={(e) => setKyc(e.target.value)}>
          <option value="">{t('admin.users.allKyc')}</option>
          <option value="UNDER_REVIEW">{t('admin.users.kycUnderReview')}</option>
          <option value="VERIFIED">{t('admin.users.kycVerified')}</option>
          <option value="REJECTED">{t('admin.users.kycRejected')}</option>
          <option value="NOT_STARTED">{t('admin.users.kycNotStarted')}</option>
        </select>
      </div>

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('admin.users.thUser')}</th><th>{t('admin.users.thPhone')}</th><th>{t('admin.users.thKyc')}</th><th>{t('admin.users.thRole')}</th>
                <th className={styles.right}>{t('admin.users.thBalance')}</th><th>{t('admin.users.thJoined')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className={styles.empty}>{t('admin.users.loading')}</td></tr>}
              {data && data.users.length === 0 && <tr><td colSpan={7} className={styles.empty}>{t('admin.users.noResults')}</td></tr>}
              {data?.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.firstName} {u.lastName}
                    {!u.isActive && <span className={`${styles.pill} ${styles.p_red}`} style={{ marginLeft: 6 }}>{t('admin.users.suspended')}</span>}
                    {u.deletionRequestedAt && <span className={`${styles.pill} ${styles.p_amber}`} style={{ marginLeft: 6 }}>{t('admin.users.deletionRequested')}</span>}
                    {u.email && <div className={styles.muted}>{u.email}</div>}
                  </td>
                  <td className={styles.mono}>{u.phone}</td>
                  <td>{kycPill(t, u.kycStatus)} {u.kycLevel > 0 && <span className={styles.muted}>N{u.kycLevel}</span>}</td>
                  <td className={styles.muted}>{u.role}</td>
                  <td className={styles.right}>{formatCurrency(u.balance)}</td>
                  <td className={styles.muted}>{formatRelativeDate(u.createdAt)}</td>
                  <td className={styles.right}>
                    {MODERATABLE.has(u.role) ? (
                      <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                          className={`${styles.pill} ${u.isActive ? styles.p_red : styles.p_green}`}
                          style={{ border: 'none', cursor: 'pointer' }}
                          onClick={() => openModeration(u)}
                        >
                          {u.isActive ? t('admin.users.suspend') : t('admin.users.reactivate')}
                        </button>
                        {u.deletionRequestedAt && (
                          <button
                            className={`${styles.pill} ${styles.p_amber}`}
                            style={{ border: 'none', cursor: 'pointer' }}
                            onClick={() => openErase(u)}
                          >
                            {t('admin.users.erase')}
                          </button>
                        )}
                      </span>
                    ) : <span className={styles.muted}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={
          mode === 'erase'
            ? t('admin.users.modalEraseTitle')
            : target?.isActive
              ? t('admin.users.modalSuspendTitle')
              : t('admin.users.modalReactivateTitle')
        }
      >
        {target && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, margin: 0 }}>
              {target.firstName} {target.lastName} · <span className={styles.mono}>{target.phone}</span>
            </p>
            {mode === 'erase' ? (
              <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: 0 }}>
                {t('admin.users.eraseWarning')}
              </p>
            ) : target.isActive ? (
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
                {t('admin.users.suspendWarning')}
              </p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
                {t('admin.users.reactivateNote')}
              </p>
            )}
            {(target.isActive || mode === 'erase') && (
              <textarea
                className={styles.textarea}
                placeholder={
                  mode === 'erase'
                    ? t('admin.users.eraseReasonPlaceholder')
                    : t('admin.users.reasonPlaceholder')
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            )}
            <button
              className={`btn btn-full ${target.isActive || mode === 'erase' ? 'btn-danger' : 'btn-primary'}`}
              disabled={busy}
              onClick={confirmModeration}
            >
              {busy
                ? '…'
                : mode === 'erase'
                  ? t('admin.users.confirmErase')
                  : target.isActive
                    ? t('admin.users.confirmSuspend')
                    : t('admin.users.confirmReactivate')}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
