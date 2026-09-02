'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from '../admin.module.css';
import { kycPill } from '../pills';
import { useAdminKycList } from '@/hooks/useAdmin';
import { formatRelativeDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';

export default function AdminKycPage() {
  const t = useT();
  const [status, setStatus] = useState('UNDER_REVIEW');
  const { data, isLoading } = useAdminKycList(status);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>{t('admin.kyc.title')}</h1>
      <p className={styles.lede}>{t('admin.kyc.lede')}</p>

      <div className={styles.toolbar}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="UNDER_REVIEW">{t('admin.kyc.fUnderReview')}</option>
          <option value="IN_PROGRESS">{t('admin.kyc.fInProgress')}</option>
          <option value="ACTION_REQUIRED">{t('admin.kyc.fActionRequired')}</option>
          <option value="REJECTED">{t('admin.kyc.fRejected')}</option>
          <option value="VERIFIED">{t('admin.kyc.fVerified')}</option>
          <option value="ALL">{t('admin.kyc.fAll')}</option>
        </select>
      </div>

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('admin.kyc.thApplicant')}</th><th>{t('admin.kyc.thStatus')}</th><th>{t('admin.kyc.thLevel')}</th>
                <th>{t('admin.kyc.thDocs')}</th><th>{t('admin.kyc.thSubmitted')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className={styles.empty}>{t('admin.kyc.loading')}</td></tr>}
              {data && data.length === 0 && <tr><td colSpan={6} className={styles.empty}>{t('admin.kyc.none')}</td></tr>}
              {data?.map((c) => (
                <tr key={c.id}>
                  <td>{c.user.firstName} {c.user.lastName}<div className={styles.muted}>{c.user.phone}</div></td>
                  <td>{kycPill(t, c.status)}</td>
                  <td className={styles.muted}>N{c.level}</td>
                  <td className={styles.muted}>{c.documents.length}</td>
                  <td className={styles.muted}>{c.submittedAt ? formatRelativeDate(c.submittedAt) : '—'}</td>
                  <td><Link href={`/admin/kyc/${c.id}`} className={styles.linkCell}>{t('admin.kyc.examine')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
