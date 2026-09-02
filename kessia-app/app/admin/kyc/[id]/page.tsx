'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../../admin.module.css';
import { kycPill } from '../../pills';
import { useAdminKycCase } from '@/hooks/useAdmin';
import { useUiStore } from '@/store/uiStore';
import { formatDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';

export default function AdminKycReviewPage({ params }: { params: { id: string } }) {
  const t = useT();
  const router = useRouter();
  const addToast = useUiStore((s) => s.addToast);
  const { kycCase, isLoading, error, review } = useAdminKycCase(params.id);
  const [reason, setReason] = useState('');
  const [level, setLevel] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function decide(decision: 'VERIFIED' | 'REJECTED' | 'ACTION_REQUIRED') {
    setErr(null);
    if ((decision === 'REJECTED' || decision === 'ACTION_REQUIRED') && reason.trim().length < 10) {
      setErr(t('admin.kyc.reasonRequired'));
      return;
    }
    setBusy(true);
    const r = await review(decision, reason.trim() || undefined, decision === 'VERIFIED' ? level : undefined);
    setBusy(false);
    if (r.success) {
      addToast({ type: 'success', message: r.message });
      router.push('/admin/kyc');
    } else setErr(r.message);
  }

  return (
    <div className={styles.wrap}>
      <Link href="/admin/kyc" className={styles.back}>{t('admin.kyc.back')}</Link>

      {isLoading && <div className={styles.empty}>{t('admin.kyc.loading')}</div>}
      {error && !isLoading && <div className={styles.err}>{t('admin.kyc.notFound')}</div>}

      {kycCase && (
        <>
          <h1 className={styles.h1}>{kycCase.user.firstName} {kycCase.user.lastName}</h1>
          <p className={styles.lede}>{kycCase.user.phone}{kycCase.user.email ? ` · ${kycCase.user.email}` : ''} — {kycPill(t, kycCase.status)}</p>

          <div className={styles.reviewGrid}>
            <div>
              {kycCase.documents.length === 0 && <div className={styles.panel}>{t('admin.kyc.noDocs')}</div>}
              {kycCase.documents.map((d) => (
                <div key={d.id} className={styles.panel} style={{ marginBottom: 12 }}>
                  <h3>{t(`admin.kyc.doc.${d.type}`)} <span className={styles.muted}>· {formatDate(d.uploadedAt)}</span></h3>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.fileUrl} alt={d.type} className={styles.docImg} />
                </div>
              ))}
            </div>

            <div className={styles.panel}>
              <h3>{t('admin.kyc.decision')}</h3>
              <div className={styles.field}><b>{t('admin.kyc.levelRequested')}</b> {kycCase.level}</div>
              {kycCase.rejectionReason && <div className={styles.field}><b>{t('admin.kyc.previousReason')}</b> {kycCase.rejectionReason}</div>}

              <label className={styles.field} htmlFor="lvl"><b>{t('admin.kyc.levelToGrant')}</b></label>
              <select id="lvl" className={styles.textarea} style={{ minHeight: 0, padding: '8px 12px' }}
                value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                <option value={1}>{t('admin.kyc.level1')}</option><option value={2}>{t('admin.kyc.level2')}</option><option value={3}>{t('admin.kyc.level3')}</option>
              </select>

              <label className={styles.field} htmlFor="rsn" style={{ marginTop: 10 }}><b>{t('admin.kyc.reasonLabel')}</b></label>
              <textarea id="rsn" className={styles.textarea} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={t('admin.kyc.reasonPlaceholder')} />

              {err && <div className={styles.err}>{err}</div>}

              <div className={styles.reviewActions}>
                <button className="btn btn-primary btn-full" disabled={busy} onClick={() => decide('VERIFIED')}>{t('admin.kyc.validate')}</button>
                <button className="btn btn-full" style={{ background: 'var(--color-warning)', color: '#fff' }} disabled={busy} onClick={() => decide('ACTION_REQUIRED')}>{t('admin.kyc.requestAction')}</button>
                <button className="btn btn-danger btn-full" disabled={busy} onClick={() => decide('REJECTED')}>{t('admin.kyc.reject')}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
