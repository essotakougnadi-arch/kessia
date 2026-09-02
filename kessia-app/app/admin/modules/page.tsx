'use client';

import styles from '../admin.module.css';
import { useAdminModules } from '@/hooks/useAdmin';
import { useT } from '@/lib/i18n';

const ST: Record<string, string> = { SOON: 'p_blue', REGULATED: 'p_amber' };

export default function AdminModulesPage() {
  const t = useT();
  const { data, isLoading } = useAdminModules();
  const max = Math.max(1, ...(data?.modules.map((m) => m.interested) ?? [1]));

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>{t('admin.modules.title')}</h1>
      <p className={styles.lede}>
        {data ? t('admin.modules.lede', { n: data.total }) : '…'}
      </p>

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr><th>{t('admin.modules.thModule')}</th><th>{t('admin.modules.thRef')}</th><th>{t('admin.modules.thStatus')}</th><th style={{ width: '40%' }}>{t('admin.modules.thInterest')}</th><th className={styles.right}>{t('admin.modules.thTotal')}</th></tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className={styles.empty}>{t('admin.modules.loading')}</td></tr>}
              {data?.modules.map((m) => (
                <tr key={m.key}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td className={styles.mono}>{m.ref}</td>
                  <td><span className={`${styles.pill} ${styles[ST[m.status] ?? 'p_grey']}`}>{m.status}</span></td>
                  <td>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--color-border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(m.interested / max) * 100}%`, background: 'var(--color-primary)', borderRadius: 4 }} />
                    </div>
                  </td>
                  <td className={`${styles.right} ${styles.mono}`}>{m.interested}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
