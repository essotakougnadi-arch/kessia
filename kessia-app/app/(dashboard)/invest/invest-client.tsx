'use client';
// ============================================================
// KESSIA Invest — page d'attente (§13, module REGULATED)
// Aucune offre, montant ou promesse de rendement : ouverture
// soumise à validation réglementaire. Voir lib/modules/catalog.ts.
// ============================================================

import Link from 'next/link';
import { INVEST_CATEGORIES } from '@/lib/modules/invest-insurance-data';
import { useExplore } from '@/hooks/useExplore';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from '@/components/modules/module-page.module.css';

export default function InvestClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { interested, toggle } = useExplore();
  const on = interested.has('invest');

  async function onToggle() {
    const r = await toggle('invest');
    addToast({
      type: r.success ? 'success' : 'error',
      message: r.success
        ? (r.on ? t('explore.notified', { name: 'KESSIA Invest' }) : t('explore.removed', { name: 'KESSIA Invest' }))
        : r.message,
    });
  }

  return (
    <div className={styles.page}>
      <Link href="/explore" className={styles.back}>← {t('common.back')}</Link>

      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>{t('modulesPages.invest.heroTitle')}</h1>
        <p className={styles.heroText}>{t('modulesPages.invest.heroText')}</p>
      </div>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.invest.categoriesTitle')}</h2>
        <div className={styles.catGrid} style={{ marginTop: 10 }}>
          {INVEST_CATEGORIES.map((c) => (
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
