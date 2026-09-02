'use client';
// ============================================================
// KESSIA — Plan de croissance (cahier des charges §23)
// Objectif → action → échéance → indicateur → progression.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import styles from './growth.module.css';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { useUiStore } from '@/store/uiStore';
import { useGrowth, type GrowthStepStatus } from '@/hooks/useGrowth';
import { formatDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';
import type { GrowthStep } from '@/lib/growth/plan';

const STATUS_ACTIONS: { key: GrowthStepStatus; labelKey: string }[] = [
  { key: 'DOING', labelKey: 'growth.statusDoing' },
  { key: 'DONE', labelKey: 'growth.statusDone' },
  { key: 'SKIPPED', labelKey: 'growth.statusSkip' },
];

export default function GrowthClient() {
  const t = useT();
  const { plan, isLoading, error, refresh, setStep } = useGrowth();
  const addToast = useUiStore((s) => s.addToast);
  const [showSkipped, setShowSkipped] = useState(false);

  async function update(step: GrowthStep, status: GrowthStepStatus) {
    const next = step.status === status ? 'TODO' : status;
    const r = await setStep(step.key, next);
    addToast({ type: r.success ? 'success' : 'error', message: r.success ? t('growth.updated') : r.message });
  }

  const visible = (plan?.steps ?? []).filter((s) => showSkipped || s.status !== 'SKIPPED');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/home" className={styles.back} aria-label={t('growth.back')}>←</Link>
        <div>
          <h1 className={styles.title}>{t('growth.title')}</h1>
          <div className={styles.sub}>{t('growth.subtitle')}</div>
        </div>
      </header>

      {error && !isLoading && <ErrorNote message={t('growth.loadError')} onRetry={refresh} />}

      <div className={styles.body}>
        {isLoading && !plan && <p className={styles.empty}>{t('growth.computing')}</p>}

        {plan && (
          <>
            <div className={styles.hero}>
              <ProgressRing pct={plan.summary.completionPct} />
              <div className={styles.heroText}>
                <div className={styles.heroHeadline}>{plan.headline}</div>
                <div className={styles.heroMeta}>
                  {t('growth.stepsMeta', {
                    done: plan.summary.done,
                    total: plan.summary.total,
                    active: plan.summary.active,
                    weeks: plan.horizonWeeks,
                  })}
                </div>
              </div>
            </div>

            <Link href="/profile/score" className={styles.scoreLink}>
              <span className={styles.scoreLabel}>KESSIA Score</span>
              <span className={styles.scoreVal}>
                {plan.score.value} · {plan.score.bandLabel}
                {plan.score.toNextBand ? ` ${t('growth.toNextBand', { points: plan.score.toNextBand })}` : ''}
              </span>
            </Link>

            {visible.length === 0 && (
              <p className={styles.empty}>{t('growth.allDone')}</p>
            )}

            {visible.map((step) => (
              <div
                key={step.key}
                className={`${styles.step} ${step.status === 'DONE' ? styles.stepDone : ''} ${step.overdue ? styles.stepOverdue : ''}`}
              >
                <div className={styles.stepTop}>
                  <span className={`${styles.stepTitle} ${step.status === 'DONE' ? styles.stepTitleDone : ''}`}>{step.title}</span>
                </div>
                <div className={styles.stepWhy}>{step.why}</div>
                <div className={styles.stepMeta}>
                  <span className={styles.pill}>{step.categoryLabel}</span>
                  <span className={styles.pill}>{step.metricLabel} : {step.targetHint}</span>
                  <span className={step.overdue ? styles.pillOver : styles.pillDue}>
                    {step.status === 'DONE'
                      ? t('growth.doneOn', { date: formatDate(step.completedAt ?? step.dueDate) })
                      : t('growth.dueOn', { date: formatDate(step.dueDate) })}
                  </span>
                </div>
                <div className={styles.actions}>
                  <Link href={step.actionUrl} className={styles.actLink}>{step.actionLabel} →</Link>
                  {STATUS_ACTIONS.map((a) => (
                    <button
                      key={a.key}
                      className={`${styles.act} ${step.status === a.key ? styles.actOn : ''}`}
                      onClick={() => update(step, a.key)}
                    >
                      {t(a.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {plan.summary.skipped > 0 && (
              <button className={styles.act} style={{ alignSelf: 'flex-start' }} onClick={() => setShowSkipped((v) => !v)}>
                {showSkipped
                  ? t('growth.hideSkipped', { count: plan.summary.skipped })
                  : t('growth.showSkipped', { count: plan.summary.skipped })}
              </button>
            )}

            <p className={styles.disclaimer}>{t('growth.disclaimer')}</p>
          </>
        )}
      </div>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <svg className={styles.ring} viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={R} fill="none" stroke="var(--color-border)" strokeWidth="7" />
      <circle
        cx="36" cy="36" r={R} fill="none" stroke="var(--color-primary)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 36 36)"
      />
      <text x="36" y="41" textAnchor="middle" fontSize="17" fontWeight="900" fill="var(--color-text)">{pct}%</text>
    </svg>
  );
}
