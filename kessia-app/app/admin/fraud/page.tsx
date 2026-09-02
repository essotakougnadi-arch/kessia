'use client';
// ============================================================
// KESSIA — Anti-fraude : file d'alertes (cahier des charges §32, §45)
// ============================================================

import { useState } from 'react';
import styles from '../admin.module.css';
import { useAdminFraud, type FraudAlertRow } from '@/hooks/useAdmin';
import { useT } from '@/lib/i18n';

const RISK_PILL: Record<string, string> = { LOW: 'p_grey', MEDIUM: 'p_blue', HIGH: 'p_amber', CRITICAL: 'p_red' };
const STATUS_PILL: Record<string, string> = { OPEN: 'p_amber', REVIEWING: 'p_blue', CONFIRMED: 'p_red', DISMISSED: 'p_grey' };

export default function AdminFraudPage() {
  const t = useT();
  const [filter, setFilter] = useState('');
  const { data, isLoading, review } = useAdminFraud(filter);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function act(a: FraudAlertRow, next: 'REVIEWING' | 'CONFIRMED' | 'DISMISSED') {
    setBusy(a.id);
    await review(a.id, next, note[a.id]);
    setBusy(null);
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>{t('admin.fraud.title')}</h1>
      <p className={styles.lede}>
        {t('admin.fraud.lede')}
      </p>

      {data && (
        <div className={styles.toolbar}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">{t('admin.fraud.fAll', { n: data.summary.open + data.summary.reviewing })}</option>
            <option value="OPEN">{t('admin.fraud.fOpen', { n: data.summary.open })}</option>
            <option value="REVIEWING">{t('admin.fraud.fReviewing', { n: data.summary.reviewing })}</option>
            <option value="CONFIRMED">{t('admin.fraud.fConfirmed', { n: data.summary.confirmed })}</option>
            <option value="DISMISSED">{t('admin.fraud.fDismissed', { n: data.summary.dismissed })}</option>
          </select>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('admin.fraud.thMember')}</th><th>{t('admin.fraud.thRisk')}</th><th className={styles.right}>{t('admin.fraud.thScore')}</th>
                <th>{t('admin.fraud.thContext')}</th><th>{t('admin.fraud.thSignals')}</th><th>{t('admin.fraud.thStatus')}</th><th>{t('admin.fraud.thDecision')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className={styles.empty}>{t('admin.fraud.loading')}</td></tr>}
              {data?.alerts.length === 0 && <tr><td colSpan={7} className={styles.empty}>{t('admin.fraud.none')}</td></tr>}
              {data?.alerts.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.user.firstName} {a.user.lastName}
                    <div className={styles.muted}>{a.user.phone}</div>
                  </td>
                  <td><span className={`${styles.pill} ${styles[RISK_PILL[a.riskLevel]]}`}>{t(`admin.fraud.risk.${a.riskLevel}`)}</span></td>
                  <td className={`${styles.right} ${styles.mono}`}>{a.score}</td>
                  <td className={styles.mono}>{a.context}</td>
                  <td>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {a.signals.map((s, i) => <li key={i} className={styles.muted}>{s.label}</li>)}
                    </ul>
                  </td>
                  <td><span className={`${styles.pill} ${styles[STATUS_PILL[a.status]]}`}>{t(`admin.fraud.st.${a.status}`)}</span></td>
                  <td>
                    {a.status === 'OPEN' || a.status === 'REVIEWING' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                        <input
                          className={styles.mono}
                          placeholder={t('admin.fraud.notePlaceholder')}
                          value={note[a.id] ?? ''}
                          onChange={(e) => setNote((n) => ({ ...n, [a.id]: e.target.value }))}
                          style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          {a.status === 'OPEN' && (
                            <button disabled={busy === a.id} onClick={() => act(a, 'REVIEWING')} className={styles.linkCell} style={{ background: 'none', border: 0, cursor: 'pointer' }}>{t('admin.fraud.take')}</button>
                          )}
                          <button disabled={busy === a.id} onClick={() => act(a, 'DISMISSED')} className={styles.linkCell} style={{ background: 'none', border: 0, cursor: 'pointer' }}>{t('admin.fraud.dismiss')}</button>
                          <button disabled={busy === a.id} onClick={() => act(a, 'CONFIRMED')} className={styles.linkCell} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-danger)' }}>{t('admin.fraud.confirm')}</button>
                        </div>
                      </div>
                    ) : (
                      <span className={styles.muted}>{a.decisionNote || '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
