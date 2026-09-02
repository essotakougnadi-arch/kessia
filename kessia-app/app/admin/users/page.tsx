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
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirmModeration() {
    if (!target) return;
    setBusy(true);
    const r = await moderate(target.id, target.isActive ? 'suspend' : 'reactivate', reason.trim() || undefined);
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
                    {u.email && <div className={styles.muted}>{u.email}</div>}
                  </td>
                  <td className={styles.mono}>{u.phone}</td>
                  <td>{kycPill(t, u.kycStatus)} {u.kycLevel > 0 && <span className={styles.muted}>N{u.kycLevel}</span>}</td>
                  <td className={styles.muted}>{u.role}</td>
                  <td className={styles.right}>{formatCurrency(u.balance)}</td>
                  <td className={styles.muted}>{formatRelativeDate(u.createdAt)}</td>
                  <td className={styles.right}>
                    {MODERATABLE.has(u.role) ? (
                      <button
                        className={`${styles.pill} ${u.isActive ? styles.p_red : styles.p_green}`}
                        style={{ border: 'none', cursor: 'pointer' }}
                        onClick={() => { setTarget(u); setReason(''); }}
                      >
                        {u.isActive ? t('admin.users.suspend') : t('admin.users.reactivate')}
                      </button>
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
        title={target?.isActive ? t('admin.users.modalSuspendTitle') : t('admin.users.modalReactivateTitle')}
      >
        {target && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, margin: 0 }}>
              {target.firstName} {target.lastName} · <span className={styles.mono}>{target.phone}</span>
            </p>
            {target.isActive ? (
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
                {t('admin.users.suspendWarning')}
              </p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
                {t('admin.users.reactivateNote')}
              </p>
            )}
            {target.isActive && (
              <textarea
                className={styles.textarea}
                placeholder={t('admin.users.reasonPlaceholder')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            )}
            <button
              className={`btn btn-full ${target.isActive ? 'btn-danger' : 'btn-primary'}`}
              disabled={busy}
              onClick={confirmModeration}
            >
              {busy ? '…' : target.isActive ? t('admin.users.confirmSuspend') : t('admin.users.confirmReactivate')}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
