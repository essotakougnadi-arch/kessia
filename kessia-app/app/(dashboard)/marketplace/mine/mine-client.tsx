'use client';
// ============================================================
// KESSIA — Marketplace : mes articles en vente + mes achats
// ============================================================

import Link from 'next/link';
import { useMyMarketplace, useMarketplaceActions } from '@/hooks/useMarketplace';
import { useUiStore } from '@/store/uiStore';
import { formatNumber, formatRelativeDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';
import styles from '../marketplace.module.css';

function fcfa(c: string) {
  return c === 'XOF' || c === 'XAF' ? 'FCFA' : c;
}

export default function MineClient() {
  const t = useT();
  const { items, purchases, isLoading, refresh } = useMyMarketplace();
  const { archiveItem } = useMarketplaceActions();
  const addToast = useUiStore((s) => s.addToast);

  async function archive(id: string) {
    const r = await archiveItem(id);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) refresh();
  }

  return (
    <div className={styles.page}>
      <Link href="/marketplace" className={styles.back}>← {t('market.title')}</Link>

      <div className={styles.mineHead}>
        <h1 className={styles.title}>{t('market.mineTitle')}</h1>
        <Link href="/marketplace/sell" className="btn btn-primary btn-sm">＋ {t('market.sell')}</Link>
      </div>

      {/* Mes articles */}
      <section className={styles.mineSection}>
        <h2 className={styles.mineSubtitle}>{t('market.mySales')}</h2>
        {isLoading && <div className={styles.skeleton} style={{ height: 80 }} />}
        {!isLoading && items.length === 0 && <p className={styles.mineEmpty}>{t('market.noSales')}</p>}
        <div className={styles.mineList}>
          {items.map((it) => (
            <div key={it.id} className={styles.mineRow}>
              <Link href={`/marketplace/${it.id}`} className={styles.mineRowMain}>
                <div className={styles.mineThumb}>
                  {it.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={it.imageUrl} alt="" />
                    : <span>🛍️</span>}
                </div>
                <div>
                  <div className={styles.mineRowTitle}>{it.title}</div>
                  <div className={styles.mineRowMeta}>
                    {formatNumber(it.price)} {fcfa(it.currency)} · {t('market.stockN', { n: it.stock })}
                    {it.orderCount > 0 ? ` · ${t('market.ordersN', { n: it.orderCount })}` : ''}
                  </div>
                </div>
              </Link>
              <button className="btn btn-ghost btn-sm" onClick={() => archive(it.id)}>{t('market.archive')}</button>
            </div>
          ))}
        </div>
      </section>

      {/* Mes achats */}
      <section className={styles.mineSection}>
        <h2 className={styles.mineSubtitle}>{t('market.myPurchases')}</h2>
        {!isLoading && purchases.length === 0 && <p className={styles.mineEmpty}>{t('market.noPurchases')}</p>}
        <div className={styles.mineList}>
          {purchases.map((o) => (
            <div key={o.id} className={styles.mineRow}>
              <div className={styles.mineRowMain}>
                <div className={styles.mineThumb}><span>{o.mode === 'TONTINE' ? '🔄' : '💰'}</span></div>
                <div>
                  <div className={styles.mineRowTitle}>{o.item.title}</div>
                  <div className={styles.mineRowMeta}>
                    {formatNumber(o.amount)} {fcfa(o.currency)} · {t(`market.orderStatus.${o.status}`, o.status)} · {formatRelativeDate(o.createdAt)}
                  </div>
                </div>
              </div>
              {o.tontineId && (
                <Link href={`/tontine/${o.tontineId}`} className="btn btn-ghost btn-sm">{t('market.openPlan')}</Link>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
