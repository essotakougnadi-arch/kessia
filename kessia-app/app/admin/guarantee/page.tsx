'use client';

import { useState } from 'react';
import styles from '../admin.module.css';
import { useAdminGuarantee } from '@/hooks/useAdmin';
import { useUiStore } from '@/store/uiStore';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatRelativeDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';

const ST: Record<string, string> = { PENDING: 'p_amber', APPROVED: 'p_green', SETTLED: 'p_green', REJECTED: 'p_red', CANCELLED: 'p_grey' };

export default function AdminGuaranteePage() {
  const t = useT();
  const [filter, setFilter] = useState('');
  const { data, isLoading, review } = useAdminGuarantee(filter);
  const addToast = useUiStore((s) => s.addToast);

  const [target, setTarget] = useState<{ id: string; amount: number; reason: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function decide(decision: 'APPROVED' | 'REJECTED') {
    if (!target) return;
    setBusy(true);
    const r = await review(target.id, decision, note.trim());
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) { setTarget(null); setNote(''); }
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>{t('admin.guarantee.title')}</h1>
      <p className={styles.lede}>
        {t('admin.guarantee.lede')}
      </p>

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
          {[
            [t('admin.guarantee.kpiProjected'), formatCurrency(data.fund.projectedBalance)],
            [t('admin.guarantee.kpiCollected'), formatCurrency(data.fund.projectedContributions)],
            [t('admin.guarantee.kpiSettled'), formatCurrency(data.fund.claimsSettledTotal)],
            [t('admin.guarantee.kpiPending'), String(data.fund.claims.pending)],
          ].map(([label, val]) => (
            <div key={label} className={styles.card} style={{ padding: 16 }}>
              <div className={styles.muted} style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: 'var(--color-text)' }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.toolbar}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">{t('admin.guarantee.fAll')}</option>
          <option value="PENDING">{t('admin.guarantee.fPending')}</option>
          <option value="SETTLED">{t('admin.guarantee.fSettled')}</option>
          <option value="REJECTED">{t('admin.guarantee.fRejected')}</option>
        </select>
      </div>

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr><th>{t('admin.guarantee.thApplicant')}</th><th>{t('admin.guarantee.thAmount')}</th><th>{t('admin.guarantee.thReason')}</th><th>{t('admin.guarantee.thStatus')}</th><th>{t('admin.guarantee.thFiled')}</th><th></th></tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className={styles.empty}>{t('admin.guarantee.loading')}</td></tr>}
              {data && data.claims.length === 0 && <tr><td colSpan={6} className={styles.empty}>{t('admin.guarantee.none')}</td></tr>}
              {data?.claims.map((c) => (
                <tr key={c.id}>
                  <td>{c.user.firstName} {c.user.lastName}<div className={styles.muted}>{c.user.phone}</div></td>
                  <td className={styles.mono}>{formatCurrency(c.amount)}</td>
                  <td style={{ maxWidth: 280 }}>{c.reason}{c.decisionNote && <div className={styles.muted}>→ {c.decisionNote}</div>}</td>
                  <td><span className={`${styles.pill} ${styles[ST[c.status] ?? 'p_grey']}`}>{t(`admin.guarantee.st.${c.status}`)}</span></td>
                  <td className={styles.muted}>{formatRelativeDate(c.createdAt)}</td>
                  <td className={styles.right}>
                    {c.status === 'PENDING' && (
                      <button
                        className={`${styles.pill} ${styles.p_blue}`}
                        style={{ border: 'none', cursor: 'pointer' }}
                        onClick={() => { setTarget({ id: c.id, amount: c.amount, reason: c.reason }); setNote(''); }}
                      >
                        {t('admin.guarantee.examine')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.events.length > 0 && (
        <>
          <h2 className={styles.h1} style={{ fontSize: 18, marginTop: 28 }}>{t('admin.guarantee.journalTitle')}</h2>
          <div className={styles.card} style={{ padding: 16 }}>
            {data.events.slice(0, 20).map((e) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--color-border)' }}>
                <span>{e.type}{e.amount ? ` · ${formatCurrency(e.amount)}` : ''}</span>
                <span className={styles.muted}>{formatRelativeDate(e.at)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={target !== null} onClose={() => setTarget(null)} title={t('admin.guarantee.modalTitle')}>
        {target && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, margin: 0 }}>{t('admin.guarantee.amountRequested')} <strong>{formatCurrency(target.amount)}</strong></p>
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: 0 }}>« {target.reason} »</p>
            <textarea
              className={styles.textarea}
              placeholder={t('admin.guarantee.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary btn-full" disabled={busy} onClick={() => decide('APPROVED')}>{t('admin.guarantee.approve')}</button>
              <button className="btn btn-danger btn-full" disabled={busy} onClick={() => decide('REJECTED')}>{t('admin.guarantee.reject')}</button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
              {t('admin.guarantee.simNote')}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
