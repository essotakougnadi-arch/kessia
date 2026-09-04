'use client';
// ============================================================
// KESSIA Academy — aperçu de démonstration (§10)
// Inscription simulée côté client, aucune persistance serveur.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { COURSES, COURSE_CATEGORIES } from '@/lib/modules/academy-data';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from '@/components/modules/module-page.module.css';

const PROGRESS_STEP = 24;

export default function AcademyClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const [category, setCategory] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, number>>({});

  const shown = category ? COURSES.filter((c) => c.category === category) : COURSES;

  function enroll(id: string, title: string) {
    setEnrolled((prev) => new Set(prev).add(id));
    setProgress((prev) => ({ ...prev, [id]: 4 }));
    addToast({ type: 'success', message: t('modulesPages.academy.toastEnrolled', { title }) });
  }

  function continueCourse(id: string, title: string) {
    setProgress((prev) => {
      const next = Math.min(100, (prev[id] ?? 4) + PROGRESS_STEP);
      if (next >= 100 && (prev[id] ?? 0) < 100) {
        addToast({ type: 'success', message: t('modulesPages.academy.toastCompleted', { title }) });
      } else {
        addToast({ type: 'info', message: t('modulesPages.academy.toastContinue') });
      }
      return { ...prev, [id]: next };
    });
  }

  return (
    <div className={styles.page}>
      <Link href="/explore" className={styles.back}>← {t('common.back')}</Link>

      <header className={styles.header}>
        <span className={styles.headerIcon} style={{ background: 'rgba(31,93,74,0.12)', color: '#1F5D4A' }}>🎓</span>
        <div>
          <h1 className={styles.title}>{t('modulesPages.academy.pageTitle')}</h1>
          <p className={styles.sub}>{t('modulesPages.academy.pageSub')}</p>
        </div>
      </header>

      <div className={styles.banner}>
        <strong>{t('modulesPages.previewLabel')}</strong> {t('modulesPages.academy.banner')}
      </div>

      <div className={styles.chips}>
        <button className={`${styles.chip} ${!category ? styles.chipActive : ''}`} onClick={() => setCategory(null)}>
          {t('modulesPages.academy.allCategories')}
        </button>
        {COURSE_CATEGORIES.map((c) => (
          <button key={c} className={`${styles.chip} ${category === c ? styles.chipActive : ''}`} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        {shown.map((c) => {
          const isEnrolled = enrolled.has(c.id);
          const pct = progress[c.id] ?? 0;
          const isDone = pct >= 100;
          return (
            <div key={c.id} className={styles.card} id={`course-${c.id}`}>
              <div className={styles.cardTop}>
                <span className={styles.cardIcon} style={{ background: 'rgba(31,93,74,0.1)' }}>{c.icon}</span>
                <div>
                  <div className={styles.cardTitle}>{c.title}</div>
                  <div className={styles.cardMeta}>{c.instructor} · {c.duration}</div>
                </div>
              </div>
              <p className={styles.cardDesc}>{c.summary}</p>
              <div className={styles.tagRow}>
                <span className={styles.tag}>{c.category}</span>
                <span className={`${styles.tag} ${styles.tagGold}`}>{c.level}</span>
                {isDone && <span className={`${styles.tag} ${styles.tagGreen}`}>{t('modulesPages.academy.completed')}</span>}
              </div>

              {isEnrolled && (
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                </div>
              )}

              <div className={styles.cardFoot}>
                <span className={styles.cardStat}>{t('modulesPages.academy.studentsN', { n: c.students })}</span>
                {!isEnrolled && (
                  <button className={styles.actionBtn} onClick={() => enroll(c.id, c.title)} id={`btn-enroll-${c.id}`}>
                    {t('modulesPages.academy.enroll')}
                  </button>
                )}
                {isEnrolled && !isDone && (
                  <button className={`${styles.actionBtn} ${styles.actionBtnGhost}`} onClick={() => continueCourse(c.id, c.title)} id={`btn-continue-${c.id}`}>
                    {t('modulesPages.academy.continueCourse')}
                  </button>
                )}
                {isDone && (
                  <a
                    className={styles.actionBtn}
                    href={`/api/v1/academy/certificate?course=${c.id}`}
                    target="_blank"
                    rel="noreferrer"
                    id={`btn-certificate-${c.id}`}
                  >
                    🎓 {t('modulesPages.academy.getCertificate')}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
