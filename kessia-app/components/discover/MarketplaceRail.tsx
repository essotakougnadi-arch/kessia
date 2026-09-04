'use client';
// ============================================================
// KESSIA — Fil « Marketplace » (rail horizontal / grille)
// Articles récents de la communauté. Sur la landing : défilement
// automatique droite → gauche (marquee, pause au survol,
// désactivé si prefers-reduced-motion).
// ============================================================

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useDiscover } from '@/hooks/useDiscover';
import { useMarketplaceList, type MarketItem } from '@/hooks/useMarketplace';
import { useAuthStore } from '@/store/authStore';
import { formatNumber } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';
import styles from './DiscoveryRail.module.css';

function fcfa(c: string) {
  return c === 'XOF' || c === 'XAF' ? 'FCFA' : c;
}

interface Props {
  /** 'discover' = rail depuis /api/v1/discover (public) · 'full' = catalogue complet */
  source?: 'discover' | 'full';
  layout?: 'rail' | 'grid';
  limit?: number;
  showHeader?: boolean;
  /** défilement automatique droite → gauche (marquee) — landing */
  autoScroll?: boolean;
  emptyText?: string;
}

export function MarketplaceRail({
  source = 'discover',
  layout = 'rail',
  limit = 12,
  showHeader = true,
  autoScroll = false,
  emptyText,
}: Props) {
  const t = useT();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const discover = useDiscover();
  const full = useMarketplaceList();

  const isLoading = source === 'full' ? full.isLoading : discover.isLoading;
  const items = source === 'full' ? full.items : discover.items;

  if (!isLoading && items.length === 0) {
    return emptyText ? <p className={styles.empty}>{emptyText}</p> : null;
  }

  const shown = items.slice(0, limit);
  const marquee = autoScroll && layout === 'rail' && !isLoading && shown.length >= 3;

  function hrefFor(it: MarketItem) {
    return isAuthenticated ? `/marketplace/${it.id}` : `/register?next=${encodeURIComponent(`/marketplace/${it.id}`)}`;
  }
  function onClick(it: MarketItem) {
    if (isAuthenticated) return;
    try {
      sessionStorage.setItem('kessia-after-auth', `/marketplace/${it.id}`);
    } catch {
      /* indisponible */
    }
  }

  function Card({ it, dup = false }: { it: MarketItem; dup?: boolean }) {
    return (
      <Link
        href={hrefFor(it)}
        onClick={() => onClick(it)}
        className={`${styles.card} ${styles.itemCard}`}
        role="listitem"
        id={dup ? undefined : `market-item-${it.id}`}
        tabIndex={dup ? -1 : undefined}
        aria-hidden={dup || undefined}
      >
        <div className={styles.thumb}>
          {it.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.imageUrl} alt="" loading="lazy" />
          ) : (
            <span className={styles.thumbFallback}>🛍️</span>
          )}
          {it.payableByTontine && <span className={styles.tontineBadge}>🔄 {t('market.byTontine')}</span>}
        </div>
        <div className={styles.name}>{it.title}</div>
        <div className={styles.metaRow}>
          <strong>{formatNumber(it.price)}</strong> {fcfa(it.currency)}
        </div>
        <div className={styles.footRow}>
          <span className={styles.seats}>{it.businessName || it.sellerName || t('market.community')}</span>
          <span className={styles.cta}>{isAuthenticated ? t('market.view') : t('market.discover')} →</span>
        </div>
      </Link>
    );
  }

  return (
    <section className={styles.wrap} aria-labelledby="market-rail-title">
      {showHeader && (
        <div className={styles.head}>
          <div>
            <h2 id="market-rail-title" className={styles.title}>{t('market.railTitle')}</h2>
            <p className={styles.sub}>{t('market.railSub')}</p>
          </div>
          <Link href="/marketplace" className={styles.seeAll}>{t('market.seeAll')} →</Link>
        </div>
      )}

      {marquee ? (
        <div className={styles.marquee}>
          <div
            className={styles.marqueeTrack}
            style={{ '--marquee-duration': `${Math.max(28, shown.length * 4)}s` } as CSSProperties}
            role="list"
          >
            {shown.map((it) => <Card key={it.id} it={it} />)}
            {shown.map((it) => <Card key={`dup-${it.id}`} it={it} dup />)}
          </div>
        </div>
      ) : (
        <div className={layout === 'grid' ? styles.grid : styles.rail} role="list">
          {isLoading && [0, 1, 2].map((i) => <div key={i} className={`${styles.card} ${styles.cardSkeleton}`} role="listitem" />)}
          {shown.map((it) => <Card key={it.id} it={it} />)}
        </div>
      )}
    </section>
  );
}

export default MarketplaceRail;
