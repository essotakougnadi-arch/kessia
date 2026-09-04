'use client';
// ============================================================
// KESSIA Jobs — aperçu de démonstration (§12)
// Candidature simulée côté client, aucune persistance serveur.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { JOB_LISTINGS, JOB_TYPES, type JobType } from '@/lib/modules/jobs-data';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from '@/components/modules/module-page.module.css';

export default function JobsClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const [type, setType] = useState<JobType | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const shown = type ? JOB_LISTINGS.filter((j) => j.type === type) : JOB_LISTINGS;

  function apply(id: string, title: string) {
    setApplied((prev) => new Set(prev).add(id));
    addToast({ type: 'success', message: t('modulesPages.jobs.toastApplied', { title }) });
  }

  return (
    <div className={styles.page}>
      <Link href="/explore" className={styles.back}>← {t('common.back')}</Link>

      <header className={styles.header}>
        <span className={styles.headerIcon} style={{ background: 'rgba(122,92,192,0.14)', color: '#7A5CC0' }}>💼</span>
        <div>
          <h1 className={styles.title}>{t('modulesPages.jobs.pageTitle')}</h1>
          <p className={styles.sub}>{t('modulesPages.jobs.pageSub')}</p>
        </div>
      </header>

      <div className={styles.banner}>
        <strong>{t('modulesPages.previewLabel')}</strong> {t('modulesPages.jobs.banner')}
      </div>

      <div className={styles.chips}>
        <button className={`${styles.chip} ${!type ? styles.chipActive : ''}`} onClick={() => setType(null)}>
          {t('modulesPages.jobs.allTypes')}
        </button>
        {JOB_TYPES.map((jt) => (
          <button key={jt} className={`${styles.chip} ${type === jt ? styles.chipActive : ''}`} onClick={() => setType(jt)}>
            {jt}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        {shown.map((j) => {
          const isApplied = applied.has(j.id);
          return (
            <div key={j.id} className={styles.card} id={`job-${j.id}`}>
              <div className={styles.cardTop}>
                <span className={styles.cardIcon} style={{ background: 'rgba(122,92,192,0.12)' }}>🏢</span>
                <div>
                  <div className={styles.cardTitle}>{j.title}</div>
                  <div className={styles.cardMeta}>{j.company} · {j.city}</div>
                </div>
              </div>
              <p className={styles.cardDesc}>{j.description}</p>
              <div className={styles.tagRow}>
                <span className={styles.tag}>{j.type}</span>
                <span className={`${styles.tag} ${styles.tagGreen}`}>{j.sector}</span>
              </div>
              <div className={styles.cardFoot}>
                <span className={styles.cardStat}>
                  {j.salary} · {t('modulesPages.jobs.postedDaysAgo', { n: j.postedDaysAgo })}
                </span>
                <button
                  className={`${styles.actionBtn} ${isApplied ? styles.actionBtnDone : ''}`}
                  disabled={isApplied}
                  onClick={() => apply(j.id, j.title)}
                  id={`btn-apply-${j.id}`}
                >
                  {isApplied ? t('modulesPages.jobs.applied') : t('modulesPages.jobs.apply')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
