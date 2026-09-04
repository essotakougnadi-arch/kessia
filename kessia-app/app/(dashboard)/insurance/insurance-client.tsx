'use client';
// ============================================================
// KESSIA Insurance — aperçu de démonstration (§14, module REGULATED)
// Les formules ci-dessous sont des EXEMPLES PÉDAGOGIQUES (primes
// illustratives, non contractuelles) : souscription réelle soumise à
// l'intégration d'assureurs habilités. KESSIA n'est pas assureur.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { INSURANCE_CATEGORIES, INSURANCE_EXAMPLE_PLANS } from '@/lib/modules/invest-insurance-data';
import { useExplore } from '@/hooks/useExplore';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from '@/components/modules/module-page.module.css';

export default function InsuranceClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { interested, toggle } = useExplore();
  const on = interested.has('insurance');

  const [category, setCategory] = useState<string | null>(null);
  const [simulated, setSimulated] = useState<Set<string>>(new Set());

  const shown = category ? INSURANCE_EXAMPLE_PLANS.filter((p) => p.category === category) : INSURANCE_EXAMPLE_PLANS;

  async function onToggle() {
    const r = await toggle('insurance');
    addToast({
      type: r.success ? 'success' : 'error',
      message: r.success
        ? (r.on ? t('explore.notified', { name: 'KESSIA Insurance' }) : t('explore.removed', { name: 'KESSIA Insurance' }))
        : r.message,
    });
  }

  function simulate(id: string, title: string, premiumLabel: string) {
    setSimulated((prev) => new Set(prev).add(id));
    addToast({ type: 'success', message: t('modulesPages.insurance.toastSimulate', { title, premium: premiumLabel }) });
  }

  return (
    <div className={styles.page}>
      <Link href="/explore" className={styles.back}>← {t('common.back')}</Link>

      <div className={styles.hero} style={{ background: 'var(--gradient-warm)' }}>
        <h1 className={styles.heroTitle}>{t('modulesPages.insurance.heroTitle')}</h1>
        <p className={styles.heroText}>{t('modulesPages.insurance.heroText')}</p>
      </div>

      <div className={styles.banner}>
        <strong>{t('modulesPages.previewLabel')}</strong> {t('modulesPages.insurance.exampleBanner')}
      </div>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.insurance.plansTitle')}</h2>
        <div className={styles.chips} style={{ marginTop: 10 }}>
          <button className={`${styles.chip} ${!category ? styles.chipActive : ''}`} onClick={() => setCategory(null)}>
            {t('modulesPages.insurance.allCategories')}
          </button>
          {INSURANCE_CATEGORIES.map((c) => (
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
            const isSimulated = simulated.has(p.id);
            return (
              <div key={p.id} className={styles.card} id={`plan-${p.id}`}>
                <div className={styles.cardTop}>
                  <span className={styles.cardIcon} style={{ background: 'rgba(214,168,79,0.16)' }}>{p.icon}</span>
                  <div>
                    <div className={styles.cardTitle}>{p.title}</div>
                    <div className={styles.cardMeta}>{p.category}</div>
                  </div>
                </div>
                <p className={styles.cardDesc}>{p.description}</p>
                <div className={styles.tagRow}>
                  {p.coverageHighlights.map((h) => (
                    <span key={h} className={`${styles.tag} ${styles.tagGold}`}>{h}</span>
                  ))}
                </div>
                <p className={styles.cardDesc} style={{ fontSize: 11.5, fontStyle: 'italic' }}>{p.examplePremiumLabel}</p>

                <div className={styles.cardFoot}>
                  <span className={styles.cardStat}>{t('modulesPages.insurance.notReal')}</span>
                  <button
                    className={`${styles.actionBtn} ${isSimulated ? styles.actionBtnDone : ''}`}
                    onClick={() => simulate(p.id, p.title, p.examplePremiumLabel)}
                    id={`btn-simulate-${p.id}`}
                  >
                    {isSimulated ? t('modulesPages.insurance.simulated') : t('modulesPages.insurance.simulateBtn')}
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
        id="btn-insurance-interest"
      >
        {on ? t('explore.interestOn') : t('explore.interestOff')}
      </button>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.insurance.bridgeTitle')}</h2>
        <div className={styles.bridgeRow} style={{ marginTop: 10 }}>
          <Link href="/tontine/garantie" className={styles.bridgeLink}>🛟 {t('modulesPages.insurance.bridgeGuarantee')}</Link>
        </div>
      </div>
    </div>
  );
}
