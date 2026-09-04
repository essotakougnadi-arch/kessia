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

export default function AcademyClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const [category, setCategory] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());

  const shown = category ? COURSES.filter((c) => c.category === category) : COURSES;

  function enroll(id: string, title: string) {
    setEnrolled((prev) => new Set(prev).add(id));
    addToast({ type: 'success', message: t('modulesPages.academy.toastEnrolled', { title }) });
  }

  function continueCourse() {
    addToast({ type: 'info', message: t('modulesPages.academy.toastContinue') });
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
              </div>

              {isEnrolled && (
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: '4%' }} />
                </div>
              )}

              <div className={styles.cardFoot}>
                <span className={styles.cardStat}>{t('modulesPages.academy.studentsN', { n: c.students })}</span>
                {isEnrolled ? (
                  <button className={`${styles.actionBtn} ${styles.actionBtnGhost}`} onClick={continueCourse}>
                    {t('modulesPages.academy.continueCourse')}
                  </button>
                ) : (
                  <button className={styles.actionBtn} onClick={() => enroll(c.id, c.title)} id={`btn-enroll-${c.id}`}>
                    {t('modulesPages.academy.enroll')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
