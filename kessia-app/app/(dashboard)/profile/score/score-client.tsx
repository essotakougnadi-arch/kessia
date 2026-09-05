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
            <ScoreGauge score={score.score} />
            <div className={styles.big}>
              {score.score}<span className={styles.slash}>{t('scorePage.outOf')}</span>
            </div>
            <div className={styles.band}>{score.bandLabel}</div>
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

// ── Cadran (demi-cercle rouge → jaune → vert) ─────────────────
// Remplace l'ancienne barre horizontale par un cadran façon
// compteur, avec une aiguille sur la valeur — inspiré des maquettes.

function needleColor(pct: number): string {
  if (pct < 0.4) return '#C0392B';
  if (pct < 0.7) return '#D6A84F';
  return '#1F5D4A';
}

function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score / 1000));
  const angle = -90 + pct * 180; // -90° (0, à gauche) → +90° (1000, à droite)
  const color = needleColor(pct);

  return (
    <svg viewBox="0 0 200 118" width="200" height="118" className={styles.gauge} role="img" aria-label={`${score} / 1000`}>
      <defs>
        <linearGradient id="scoreGaugeGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#C0392B" />
          <stop offset="45%" stopColor="#D6A84F" />
          <stop offset="100%" stopColor="#1F5D4A" />
        </linearGradient>
      </defs>
      <path d="M 12 108 A 88 88 0 0 1 188 108" fill="none" stroke="url(#scoreGaugeGradient)" strokeWidth="14" strokeLinecap="round" opacity="0.28" />
      <path
        d="M 12 108 A 88 88 0 0 1 188 108"
        fill="none"
        stroke="url(#scoreGaugeGradient)"
        strokeWidth="14"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={100 - pct * 100}
      />
      <line x1="100" y1="108" x2="100" y2="32" stroke={color} strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${angle} 100 108)`} />
      <circle cx="100" cy="108" r="7" fill={color} />
    </svg>
  );
}
