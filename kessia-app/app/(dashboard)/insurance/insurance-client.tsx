'use client';
// ============================================================
// KESSIA Insurance — page d'attente (§14, module REGULATED)
// Aucune offre, prime ou souscription : ouverture soumise à
// l'intégration d'assureurs habilités. KESSIA n'est pas assureur.
// ============================================================

import Link from 'next/link';
import { INSURANCE_CATEGORIES } from '@/lib/modules/invest-insurance-data';
import { useExplore } from '@/hooks/useExplore';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from '@/components/modules/module-page.module.css';

export default function InsuranceClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { interested, toggle } = useExplore();
  const on = interested.has('insurance');

  async function onToggle() {
    const r = await toggle('insurance');
    addToast({
      type: r.success ? 'success' : 'error',
      message: r.success
        ? (r.on ? t('explore.notified', { name: 'KESSIA Insurance' }) : t('explore.removed', { name: 'KESSIA Insurance' }))
        : r.message,
    });
  }

  return (
    <div className={styles.page}>
      <Link href="/explore" className={styles.back}>← {t('common.back')}</Link>

      <div className={styles.hero} style={{ background: 'var(--gradient-warm)' }}>
        <h1 className={styles.heroTitle}>{t('modulesPages.insurance.heroTitle')}</h1>
        <p className={styles.heroText}>{t('modulesPages.insurance.heroText')}</p>
      </div>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.insurance.categoriesTitle')}</h2>
        <div className={styles.catGrid} style={{ marginTop: 10 }}>
          {INSURANCE_CATEGORIES.map((c) => (
            <div key={c.title} className={styles.catCard}>
              <span className={styles.catIcon} aria-hidden>{c.icon}</span>
              <span className={styles.catTitle}>{c.title}</span>
              <p className={styles.catDesc}>{c.desc}</p>
            </div>
          ))}
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
