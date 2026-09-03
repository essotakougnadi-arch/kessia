'use client';
// ============================================================
// KESSIA — Marketplace : catalogue (§16)
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { useMarketplaceList } from '@/hooks/useMarketplace';
import { MARKETPLACE_CATEGORIES } from '@/lib/validations/marketplace';
import { formatNumber } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';
import styles from './marketplace.module.css';

function fcfa(c: string) {
  return c === 'XOF' || c === 'XAF' ? 'FCFA' : c;
}

export default function MarketplaceClient() {
  const t = useT();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>('');
  const [tontine, setTontine] = useState(false);
  const { items, isLoading } = useMarketplaceList({
    q: q || undefined,
    category: category || undefined,
    tontine,
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('market.title')}</h1>
          <p className={styles.sub}>{t('market.subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/marketplace/mine" className="btn btn-ghost btn-sm">{t('market.mine')}</Link>
          <Link href="/marketplace/sell" className="btn btn-primary btn-sm" id="btn-sell">＋ {t('market.sell')}</Link>
        </div>
      </header>

      <div className={styles.filters}>
        <input
          className={`input ${styles.search}`}
          placeholder={t('market.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={`input ${styles.select}`} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t('market.allCategories')}</option>
          {MARKETPLACE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{t(`market.category.${c}`, c)}</option>
          ))}
        </select>
        <label className={styles.toggle}>
          <input type="checkbox" checked={tontine} onChange={(e) => setTontine(e.target.checked)} />
          {t('market.tontineOnly')}
        </label>
      </div>

      {isLoading && <div className={styles.grid}>{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={styles.skeleton} />)}</div>}

      {!isLoading && items.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🛍️</div>
          <p>{t('market.empty')}</p>
          <Link href="/marketplace/sell" className="btn btn-primary">{t('market.sellFirst')}</Link>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className={styles.grid}>
          {items.map((it) => (
            <Link key={it.id} href={`/marketplace/${it.id}`} className={styles.card} id={`item-${it.id}`}>
              <div className={styles.thumb}>
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt="" loading="lazy" />
                ) : (
                  <span className={styles.thumbFallback}>🛍️</span>
                )}
                {it.payableByTontine && <span className={styles.tontineBadge}>🔄 {t('market.byTontine')}</span>}
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardTitle}>{it.title}</div>
                <div className={styles.price}>
                  {formatNumber(it.price)} <span>{fcfa(it.currency)}</span>
                </div>
                <div className={styles.cardMeta}>
                  {it.businessName || it.sellerName || t('market.community')}
                  {it.city ? ` · ${it.city}` : ''}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
