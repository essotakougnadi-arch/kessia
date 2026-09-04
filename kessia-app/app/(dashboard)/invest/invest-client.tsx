'use client';
// ============================================================
// KESSIA Invest — aperçu de démonstration (§13, module REGULATED)
// Les projets ci-dessous sont des EXEMPLES PÉDAGOGIQUES (montants et
// pourcentages illustratifs) : ouverture réelle soumise à validation
// réglementaire. Voir lib/modules/catalog.ts + invest-insurance-data.ts.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { INVEST_CATEGORIES, INVEST_EXAMPLE_PROJECTS } from '@/lib/modules/invest-insurance-data';
import { formatCurrency } from '@/lib/utils/format';
import { useExplore } from '@/hooks/useExplore';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from '@/components/modules/module-page.module.css';

export default function InvestClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { interested, toggle } = useExplore();
  const on = interested.has('invest');

  const [category, setCategory] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  const shown = category ? INVEST_EXAMPLE_PROJECTS.filter((p) => p.category === category) : INVEST_EXAMPLE_PROJECTS;

  async function onToggle() {
    const r = await toggle('invest');
    addToast({
      type: r.success ? 'success' : 'error',
      message: r.success
        ? (r.on ? t('explore.notified', { name: 'KESSIA Invest' }) : t('explore.removed', { name: 'KESSIA Invest' }))
        : r.message,
    });
  }

  function flagProject(id: string, title: string) {
    setFlagged((prev) => new Set(prev).add(id));
    addToast({ type: 'success', message: t('modulesPages.invest.toastProjectInterest', { title }) });
  }

  return (
    <div className={styles.page}>
      <Link href="/explore" className={styles.back}>← {t('common.back')}</Link>

      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>{t('modulesPages.invest.heroTitle')}</h1>
        <p className={styles.heroText}>{t('modulesPages.invest.heroText')}</p>
      </div>

      <div className={styles.banner}>
        <strong>{t('modulesPages.previewLabel')}</strong> {t('modulesPages.invest.exampleBanner')}
      </div>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.invest.projectsTitle')}</h2>
        <div className={styles.chips} style={{ marginTop: 10 }}>
          <button className={`${styles.chip} ${!category ? styles.chipActive : ''}`} onClick={() => setCategory(null)}>
            {t('modulesPages.invest.allCategories')}
          </button>
          {INVEST_CATEGORIES.map((c) => (
            <button
              key={c.title}
              className={`${styles.chip} ${category === c.title ? styles.chipActive : ''}`}
              onClick={() => setCategory(c.title)}
            >
              {c.icon} {c.title}
            </button>
          ))}
        </div>

        <div className={styles.grid} style={{ marginTop: 12 }}>
          {shown.map((p) => {
            const isFlagged = flagged.has(p.id);
            return (
              <div key={p.id} className={styles.card} id={`project-${p.id}`}>
                <div className={styles.cardTop}>
                  <span className={styles.cardIcon} style={{ background: 'rgba(31,93,74,0.12)' }}>{p.icon}</span>
                  <div>
                    <div className={styles.cardTitle}>{p.title}</div>
                    <div className={styles.cardMeta}>{p.location} · {p.category}</div>
                  </div>
                </div>
                <p className={styles.cardDesc}>{p.description}</p>

                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${p.fundedPercent}%` }} />
                </div>
                <div className={styles.tagRow}>
                  <span className={`${styles.tag} ${styles.tagGreen}`}>{t('modulesPages.invest.fundedLabel', { percent: p.fundedPercent })}</span>
                  <span className={styles.tag}>{t('modulesPages.invest.durationLabel', { n: p.durationMonths })}</span>
                </div>
                <p className={styles.cardDesc} style={{ fontSize: 11.5, fontStyle: 'italic' }}>{p.targetReturnLabel}</p>

                <div className={styles.cardFoot}>
                  <span className={styles.cardStat}>
                    {t('modulesPages.invest.goalLabel', { amount: formatCurrency(p.goalAmount) })}
                  </span>
                  <button
                    className={`${styles.actionBtn} ${isFlagged ? styles.actionBtnDone : ''}`}
                    disabled={isFlagged}
                    onClick={() => flagProject(p.id, p.title)}
                    id={`btn-project-interest-${p.id}`}
                  >
                    {isFlagged ? t('modulesPages.invest.interestedProject') : t('modulesPages.invest.interestProject')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        className={`${styles.actionBtn} ${on ? styles.actionBtnDone : ''}`}
        style={{ alignSelf: 'flex-start' }}
        onClick={onToggle}
        id="btn-invest-interest"
      >
        {on ? t('explore.interestOn') : t('explore.interestOff')}
      </button>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.invest.bridgeTitle')}</h2>
        <div className={styles.bridgeRow} style={{ marginTop: 10 }}>
          <Link href="/growth" className={styles.bridgeLink}>🌱 {t('modulesPages.invest.bridgeGrowth')}</Link>
          <Link href="/simulator" className={styles.bridgeLink}>🧮 {t('modulesPages.invest.bridgeSimulator')}</Link>
        </div>
      </div>
    </div>
  );
}
