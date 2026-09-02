'use client';

import Link from 'next/link';
import styles from '../admin.module.css';
import { ticketPill } from '../pills';
import { useAdminSupport } from '@/hooks/useAdmin';
import { formatRelativeDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';

const PRIO: Record<string, string> = { URGENT: 'p_red', HIGH: 'p_amber', NORMAL: 'p_grey', LOW: 'p_grey' };

export default function AdminSupportPage() {
  const t = useT();
  const { data, isLoading } = useAdminSupport();

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>{t('admin.support.title')}</h1>
      <p className={styles.lede}>{data ? t('admin.support.count', { n: data.length }) : '…'}</p>

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('admin.support.thTicket')}</th><th>{t('admin.support.thSubject')}</th><th>{t('admin.support.thPriority')}</th>
                <th>{t('admin.support.thStatus')}</th><th>{t('admin.support.thRequester')}</th><th>{t('admin.support.thAssignee')}</th><th>{t('admin.support.thUpdated')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className={styles.empty}>{t('admin.support.loading')}</td></tr>}
              {data && data.length === 0 && <tr><td colSpan={7} className={styles.empty}>{t('admin.support.none')}</td></tr>}
              {data?.map((tk) => (
                <tr key={tk.id}>
                  <td className={styles.mono}>
                    <Link href={`/admin/support/${tk.id}`} className={styles.linkCell}>{tk.ticketNumber}</Link>
                  </td>
                  <td>
                    <Link href={`/admin/support/${tk.id}`} className={styles.linkCell} style={{ fontWeight: 600 }}>{tk.subject}</Link>
                    <div className={styles.muted}>{t('admin.support.msgCount', { category: tk.category, count: tk.messageCount })}</div>
                  </td>
                  <td><span className={`${styles.pill} ${styles[PRIO[tk.priority] ?? 'p_grey']}`}>{tk.priority}</span></td>
                  <td>{ticketPill(t, tk.status)}</td>
                  <td className={styles.muted}>{tk.user.firstName} {tk.user.lastName}</td>
                  <td className={styles.muted}>{tk.assignedTo ? `${tk.assignedTo.firstName} ${tk.assignedTo.lastName}` : '—'}</td>
                  <td className={styles.muted}>{formatRelativeDate(tk.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
