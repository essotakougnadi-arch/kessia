'use client';
// ============================================================
// KESSIA — Fil de découverte (rail horizontal)
// Tontines publiques ouvertes. Sur la landing : défilement
// automatique droite → gauche (marquee, pause au survol,
// désactivé si prefers-reduced-motion). Sur l'accueil : rail
// à défilement manuel.
// ============================================================

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useDiscover, type DiscoverTontine } from '@/hooks/useDiscover';
import { useAuthStore } from '@/store/authStore';
import { useTontineTypeMeta } from '@/lib/tontine/type-meta-i18n';
import { formatFrequency, formatNumber } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';
import styles from './DiscoveryRail.module.css';

function fcfa(currency: string) {
  return currency === 'XOF' || currency === 'XAF' ? 'FCFA' : currency;
}

interface Props {
  /** 'home' pour l'accueil connecté, 'landing' pour la page publique */
  context?: 'home' | 'landing' | 'page';
  limit?: number;
  showHeader?: boolean;
  /** 'rail' = défilement horizontal (accueil) · 'grid' = grille (page /discover) */
  layout?: 'rail' | 'grid';
  /** défilement automatique droite → gauche (marquee) — landing */
  autoScroll?: boolean;
  /** message quand il n'y a aucune tontine (sinon le composant ne rend rien) */
  emptyText?: string;
}

export function DiscoveryRail({
  context = 'home',
  limit = 12,
  showHeader = true,
  layout = 'rail',
  autoScroll = false,
  emptyText,
}: Props) {
  const t = useT();
  const { tontines, isLoading } = useDiscover();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const typeMeta = useTontineTypeMeta();

  if (!isLoading && tontines.length === 0) {
    return emptyText ? <p className={styles.empty}>{emptyText}</p> : null;
  }

  const items = tontines.slice(0, limit);
  // Le marquee n'a de sens qu'avec assez de cartes pour boucler.
  const marquee = autoScroll && layout === 'rail' && !isLoading && items.length >= 3;

  function hrefFor(tn: DiscoverTontine) {
    if (isAuthenticated) return `/tontine/${tn.id}`;
    return `/register?next=${encodeURIComponent(`/tontine/${tn.id}`)}`;
  }

  function onCardClick(tn: DiscoverTontine) {
    if (isAuthenticated) return;
    try {
      sessionStorage.setItem('kessia-after-auth', `/tontine/${tn.id}`);
    } catch {
      /* indisponible */
    }
  }

  function Card({ tn, dup = false }: { tn: DiscoverTontine; dup?: boolean }) {
    const meta = typeMeta(tn.type);
    const isSolo = tn.type === 'PURCHASE' && tn.purchaseMode === 'SOLO';
    return (
      <Link
        href={hrefFor(tn)}
        onClick={() => onCardClick(tn)}
        className={styles.card}
        role="listitem"
        id={dup ? undefined : `discover-tontine-${tn.id}`}
        tabIndex={dup ? -1 : undefined}
        aria-hidden={dup || undefined}
      >
        <div className={styles.cardTop}>
          <span className={styles.icon} style={{ background: `${meta.accent}1F`, color: meta.accent }}>
            {meta.icon}
          </span>
          <span className={styles.typeTag}>{meta.label}</span>
        </div>

        <div className={styles.name}>{tn.name}</div>
        {tn.hasConditions && (
          <span className={styles.condTag} title={t('discover.hasConditions')}>
            🔎 {t('discover.conditions')}
          </span>
        )}
        {(tn.description || (isSolo && tn.purchaseItem)) && (
          <p className={styles.desc}>{isSolo && tn.purchaseItem ? tn.purchaseItem : tn.description}</p>
        )}

        <div className={styles.metaRow}>
          <span>
            <strong>{formatNumber(tn.amount)}</strong> {fcfa(tn.currency)}
            {' · '}
            {formatFrequency(tn.frequency)}
          </span>
        </div>

        <div className={styles.footRow}>
          <span className={styles.seats}>
            {tn.seatsLeft > 0
              ? t('discover.seatsLeft', { n: tn.seatsLeft, max: tn.maxMembers })
              : t('discover.full')}
          </span>
          <span className={styles.cta}>
            {isAuthenticated ? t('discover.view') : t('discover.joinCta')} →
          </span>
        </div>
      </Link>
    );
  }

  return (
    <section className={styles.wrap} aria-labelledby="discover-rail-title">
      {showHeader && (
        <div className={styles.head}>
          <div>
            <h2 id="discover-rail-title" className={styles.title}>
              {t('discover.railTitle')}
            </h2>
            <p className={styles.sub}>{t('discover.railSub')}</p>
          </div>
          <Link href="/discover" className={styles.seeAll}>
            {t('discover.seeAll')} →
          </Link>
        </div>
      )}

      {marquee ? (
        <div className={styles.marquee}>
          <div
            className={styles.marqueeTrack}
            style={{ '--marquee-duration': `${Math.max(28, items.length * 4)}s` } as CSSProperties}
            role="list"
          >
            {items.map((tn) => <Card key={tn.id} tn={tn} />)}
            {items.map((tn) => <Card key={`dup-${tn.id}`} tn={tn} dup />)}
          </div>
        </div>
      ) : (
        <div className={layout === 'grid' ? styles.grid : styles.rail} role="list">
          {isLoading &&
            [0, 1, 2].map((i) => <div key={i} className={`${styles.card} ${styles.cardSkeleton}`} role="listitem" />)}
          {items.map((tn) => <Card key={tn.id} tn={tn} />)}
        </div>
      )}

      {context === 'landing' && (
        <p className={styles.landingNote}>{t('discover.landingNote')}</p>
      )}
    </section>
  );
}

export default DiscoveryRail;
