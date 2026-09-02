'use client';

import styles from '../admin.module.css';
import { tontinePill } from '../pills';
import { useAdminTontines } from '@/hooks/useAdmin';
import { formatCurrency, formatRelativeDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';

export default function AdminTontinesPage() {
  const t = useT();
  const { data, isLoading } = useAdminTontines();

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>{t('admin.tontines.title')}</h1>
      <p className={styles.lede}>
        {data ? t('admin.tontines.count', { n: data.length }) : '…'}
        {data && data.length > 0 && ` · ${t('admin.tontines.escrowNote')}`}
      </p>

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('admin.tontines.thName')}</th><th>{t('admin.tontines.thStatus')}</th><th>{t('admin.tontines.thType')}</th>
                <th className={styles.right}>{t('admin.tontines.thContribution')}</th><th>{t('admin.tontines.thRound')}</th>
                <th className={styles.right}>{t('admin.tontines.thEscrow')}</th>
                <th>{t('admin.tontines.thMembers')}</th><th>{t('admin.tontines.thCreator')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className={styles.empty}>{t('admin.tontines.loading')}</td></tr>}
              {data && data.length === 0 && <tr><td colSpan={8} className={styles.empty}>{t('admin.tontines.none')}</td></tr>}
              {data?.map((tn) => (
                <tr key={tn.id}>
                  <td>{tn.name}<div className={styles.muted}>{formatRelativeDate(tn.createdAt)}</div></td>
                  <td>{tontinePill(t, tn.status)}</td>
                  <td className={styles.muted}>{tn.type}</td>
                  <td className={styles.right}>{formatCurrency(tn.amount)}</td>
                  <td className={styles.muted}>{tn.currentRound}/{tn.totalRounds}</td>
                  <td className={styles.right}>
                    {tn.escrow?.hasWallet ? (
                      <>
                        {formatCurrency(tn.escrow.held)}
                        {!tn.escrow.balanced && (
                          <span
                            className={`${styles.pill} ${styles.p_red}`}
                            style={{ marginLeft: 6 }}
                            title={t('admin.tontines.driftTitle', { drift: formatCurrency(tn.escrow.drift), expected: formatCurrency(tn.escrow.expectedHeld) })}
                          >
                            {t('admin.tontines.driftBadge')}
                          </span>
                        )}
                      </>
                    ) : <span className={styles.muted}>—</span>}
                  </td>
                  <td className={styles.muted}>{t('admin.tontines.membersLine', { members: tn.memberCount, contributions: tn.contributionCount })}</td>
                  <td className={styles.muted}>{tn.createdBy.firstName} {tn.createdBy.lastName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
