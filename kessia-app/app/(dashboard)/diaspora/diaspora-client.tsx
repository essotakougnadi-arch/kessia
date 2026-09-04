'use client';
// ============================================================
// KESSIA Global / Diaspora — aperçu (§15)
// Les tontines et articles affichés sont réels (mêmes données que
// /discover). Les transferts transfrontaliers directs ne sont pas
// disponibles ; l'intérêt est enregistré (ModuleInterest, comme /explore).
// ============================================================

import Link from 'next/link';
import { DiscoveryRail } from '@/components/discover/DiscoveryRail';
import { MarketplaceRail } from '@/components/discover/MarketplaceRail';
import { DIASPORA_COMMUNITY } from '@/lib/modules/diaspora-data';
import { useExplore } from '@/hooks/useExplore';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from '@/components/modules/module-page.module.css';

export default function DiasporaClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { interested, toggle } = useExplore();
  const wantsTransfer = interested.has('diaspora_transfer');

  async function onToggleTransfer() {
    const r = await toggle('diaspora_transfer');
    addToast({
      type: r.success ? 'success' : 'error',
      message: r.success
        ? (r.on ? t('explore.notified', { name: 'KESSIA Global / Diaspora' }) : t('explore.removed', { name: 'KESSIA Global / Diaspora' }))
        : r.message,
    });
  }

  return (
    <div className={styles.page}>
      <Link href="/explore" className={styles.back}>← {t('common.back')}</Link>

      <header className={styles.header}>
        <span className={styles.headerIcon} style={{ background: 'rgba(182,90,58,0.12)', color: '#B65A3A' }}>🌍</span>
        <div>
          <h1 className={styles.title}>{t('modulesPages.diaspora.pageTitle')}</h1>
          <p className={styles.sub}>{t('modulesPages.diaspora.pageSub')}</p>
        </div>
      </header>

      <div className={styles.banner}>
        <strong>{t('modulesPages.previewLabel')}</strong> {t('modulesPages.diaspora.banner')}
      </div>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.diaspora.communityTitle')}</h2>
        <div className={styles.statRow} style={{ marginTop: 10 }}>
          {DIASPORA_COMMUNITY.map((c) => (
            <span key={c.country} className={styles.statChip}>
              {c.flag} {c.country} · <strong>{c.members}</strong>
            </span>
          ))}
        </div>
      </div>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.diaspora.discoverTontinesTitle')}</h2>
        <div style={{ marginTop: 10 }}>
          <DiscoveryRail context="page" layout="grid" limit={6} showHeader={false} />
        </div>
      </div>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.diaspora.discoverMarketTitle')}</h2>
        <div style={{ marginTop: 10 }}>
          <MarketplaceRail source="full" layout="grid" limit={6} showHeader={false} />
        </div>
      </div>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.diaspora.transferTitle')}</h2>
        <div className={styles.banner} style={{ marginTop: 10 }}>
          {t('modulesPages.diaspora.transferBanner')}
        </div>
        <button
          className={`${styles.actionBtn} ${wantsTransfer ? styles.actionBtnDone : ''}`}
          style={{ marginTop: 10 }}
          onClick={onToggleTransfer}
          id="btn-diaspora-interest"
        >
          {wantsTransfer ? t('explore.interestOn') : t('explore.interestOff')}
        </button>
      </div>
    </div>
  );
}
