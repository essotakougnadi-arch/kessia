'use client';

import { useState } from 'react';
import styles from '../admin.module.css';
import { txPill } from '../pills';
import { useAdminTransactions } from '@/hooks/useAdmin';
import { formatCurrency, formatRelativeDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';

export default function AdminTransactionsPage() {
  const t = useT();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const { data, isLoading } = useAdminTransactions(q, status);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>{t('admin.transactions.title')}</h1>
      <p className={styles.lede}>
        {t('admin.transactions.ledgerNote')}{' '}
        {data &&
          t('admin.transactions.volumeNote', {
            volume: formatCurrency(data.totals.completedVolume),
            count: data.totals.completedCount,
          })}
      </p>

      <div className={styles.toolbar}>
        <input placeholder={t('admin.transactions.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('admin.transactions.allStatuses')}</option>
          <option value="COMPLETED">{t('admin.transactions.completed')}</option>
          <option value="PENDING">{t('admin.transactions.pending')}</option>
          <option value="FAILED">{t('admin.transactions.failed')}</option>
        </select>
      </div>

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('admin.transactions.thDate')}</th><th>{t('admin.transactions.thUser')}</th><th>{t('admin.transactions.thType')}</th>
                <th>{t('admin.transactions.thStatus')}</th><th className={styles.right}>{t('admin.transactions.thAmount')}</th><th>{t('admin.transactions.thReference')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className={styles.empty}>{t('admin.transactions.loading')}</td></tr>}
              {data && data.entries.length === 0 && <tr><td colSpan={6} className={styles.empty}>{t('admin.transactions.none')}</td></tr>}
              {data?.entries.map((e) => (
                <tr key={e.id}>
                  <td className={styles.muted}>{formatRelativeDate(e.createdAt)}</td>
                  <td>{e.user.firstName} {e.user.lastName}<div className={styles.muted}>{e.user.phone}</div></td>
                  <td className={styles.muted}>{e.type}</td>
                  <td>{txPill(t, e.status)}</td>
                  <td className={`${styles.right} ${e.direction === 'CREDIT' ? styles.pos : styles.neg}`}>
                    {e.direction === 'CREDIT' ? '+' : '-'}{formatCurrency(e.amount, e.currency)}
                  </td>
                  <td className={styles.mono}>{e.reference ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
