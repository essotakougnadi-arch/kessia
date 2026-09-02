'use client';
// ============================================================
// KESSIA Score — détail explicable (§10, §22)
// ============================================================

import Link from 'next/link';
import styles from './score.module.css';
import { useScore } from '@/hooks/useScore';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { useT } from '@/lib/i18n';
import { formatDate } from '@/lib/utils/format';

export default function ScoreClient() {
  const t = useT();
  const { score, isLoading, error, refresh } = useScore();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/profile" className={styles.back} aria-label={t('scorePage.back')}>←</Link>
        <h1 className={styles.title}>KESSIA Score</h1>
      </header>

      {error && !isLoading && (
        <ErrorNote message={t('scorePage.loadError')} onRetry={refresh} />
      )}

      {isLoading && !score && (
        <div className={styles.section}><p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: 13 }}>{t('scorePage.computing')}</p></div>
      )}

      {score && (
        <>
          <div className={styles.hero}>
            <div className={styles.big}>
              {score.score}<span className={styles.slash}>{t('scorePage.outOf')}</span>
            </div>
            <div className={styles.band}>{score.bandLabel}</div>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${(score.score / 1000) * 100}%` }} />
            </div>
            <div className={styles.updated}>
              {t('scorePage.updatedOn', { date: formatDate(score.generatedAt) })}
            </div>
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('scorePage.composition')}</h2>
            {score.factors.map((f) => {
              const pct = f.max > 0 ? Math.max(0, Math.min(100, (f.points / f.max) * 100)) : 0;
              return (
                <div key={f.key} className={styles.factor}>
                  <div className={styles.factorTop}>
                    <span className={styles.factorLabel}>{f.label}</span>
                    <span className={`${styles.factorPts} ${f.points < 0 ? styles.factorPtsNeg : ''}`}>
                      {f.points > 0 ? '+' : ''}{f.points}{f.max > 0 ? ` / ${f.max}` : ` ${t('scorePage.points')}`}
                    </span>
                  </div>
                  <div className={styles.factorDetail}>{f.detail}</div>
                  {f.max > 0 && (
                    <div className={styles.miniTrack}><div className={styles.miniFill} style={{ width: `${pct}%` }} /></div>
                  )}
                </div>
              );
            })}
          </section>

          {score.advice.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('scorePage.howToProgress')}</h2>
              <ul className={styles.advice}>
                {score.advice.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </section>
          )}

          <p className={styles.disclaimer}>{t('scorePage.disclaimer')}</p>
        </>
      )}
    </div>
  );
}
