'use client';
// ============================================================
// KESSIA — Marketplace : catalogue (§16)
// ============================================================

import { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useMarketplaceList } from '@/hooks/useMarketplace';
import { MARKETPLACE_CATEGORIES } from '@/lib/validations/marketplace';
import { formatNumber } from '@/lib/utils/format';
import { useCartStore } from '@/store/cartStore';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from './marketplace.module.css';

function fcfa(c: string) {
  return c === 'XOF' || c === 'XAF' ? 'FCFA' : c;
}

// Icônes de catégorie (refonte visuelle — remplace le <select> texte
// par une rangée de pastilles, comme sur les maquettes).
const CATEGORY_ICONS: Record<string, string> = {
  EQUIPEMENT: '🛠️',
  MATIERE_PREMIERE: '🧱',
  PRODUIT_FINI: '📦',
  SERVICE: '🤝',
  AGRICOLE: '🌾',
  ALIMENTATION_BOISSONS: '🍽️',
  VETEMENTS_ACCESSOIRES: '👗',
  AUTRE: '🏷️',
};
const ALL_CATEGORIES_ICON = '🧺';

export default function MarketplaceClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>('');
  const [tontine, setTontine] = useState(false);
  const { items, isLoading } = useMarketplaceList({
    q: q || undefined,
    category: category || undefined,
    tontine,
  });
  const cartLines = useCartStore((s) => s.lines);
  const addToCart = useCartStore((s) => s.add);
  const cartCount = cartLines.reduce((sum, l) => sum + l.qty, 0);

  function onAddToCart(e: MouseEvent, it: { id: string; title: string; price: number; currency: string; imageUrl: string | null }) {
    e.preventDefault();
    e.stopPropagation();
    addToCart(it);
    addToast({ type: 'success', message: t('market.addedToCart', { title: it.title }) });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('market.title')}</h1>
          <p className={styles.sub}>{t('market.subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/marketplace/mine" className="btn btn-ghost btn-sm">{t('market.mine')}</Link>
          <Link href="/marketplace/cart" className={`btn btn-ghost btn-sm ${styles.cartBtn}`} id="btn-cart">
            🛒 {t('market.cart')}
            {cartCount > 0 && <span className={styles.cartBadge}>{cartCount}</span>}
          </Link>
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
        <label className={styles.toggle}>
          <input type="checkbox" checked={tontine} onChange={(e) => setTontine(e.target.checked)} />
          {t('market.tontineOnly')}
        </label>
      </div>

      <div className={styles.categoryRow}>
        <button
          className={`${styles.categoryChip} ${!category ? styles.categoryChipActive : ''}`}
          onClick={() => setCategory('')}
        >
          <span className={styles.categoryIcon}>{ALL_CATEGORIES_ICON}</span>
          {t('market.allCategories')}
        </button>
        {MARKETPLACE_CATEGORIES.map((c) => (
          <button
            key={c}
            className={`${styles.categoryChip} ${category === c ? styles.categoryChipActive : ''}`}
            onClick={() => setCategory(category === c ? '' : c)}
          >
            <span className={styles.categoryIcon}>{CATEGORY_ICONS[c]}</span>
            {t(`market.category.${c}`, c)}
          </button>
        ))}
      </div>

      <h2 className={styles.sectionTitle}>
        {category ? t(`market.category.${category}`, category) : t('market.popularProducts')}
      </h2>

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
                <button
                  className={styles.addToCartBtn}
                  onClick={(e) => onAddToCart(e, { id: it.id, title: it.title, price: it.price, currency: it.currency, imageUrl: it.imageUrl })}
                  id={`btn-add-cart-${it.id}`}
                >
                  🛒 {t('market.addToCart')}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
