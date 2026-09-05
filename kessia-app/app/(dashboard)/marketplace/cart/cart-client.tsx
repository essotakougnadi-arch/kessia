'use client';
// ============================================================
// KESSIA Marketplace — Panier (ADR 0041, item 3)
//
// Panier multi-articles CÔTÉ CLIENT (localStorage, store/cartStore).
// Au paiement, chaque unité de chaque ligne est envoyée à l'API
// EXISTANTE POST /marketplace/[id]/order (mode WALLET) — le même achat
// direct qu'avant (ADR 0039), simplement enchaîné plusieurs fois.
// Aucune nouvelle route de commande, aucun nouveau modèle de données.
// Le paiement par tontine reste réservé à l'achat direct d'un seul
// article (un plan solo cible un article précis).
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import { useMarketplaceActions } from '@/hooks/useMarketplace';
import { useWallet } from '@/hooks/useWallet';
import { formatNumber } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';
import styles from '../marketplace.module.css';

function fcfa(c: string) {
  return c === 'XOF' || c === 'XAF' ? 'FCFA' : c;
}

type LineResult = { itemId: string; title: string; ok: number; failed: number; lastError?: string };

export default function CartClient() {
  const t = useT();
  const router = useRouter();
  const lines = useCartStore((s) => s.lines);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const { order } = useMarketplaceActions();
  const { wallet, refresh: refreshWallet } = useWallet();

  const [phase, setPhase] = useState<'cart' | 'processing' | 'done'>('cart');
  const [results, setResults] = useState<LineResult[]>([]);

  const currency = lines[0]?.currency ?? 'XOF';
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const balance = wallet?.balance ?? 0;
  const canPay = lines.length > 0 && balance >= total;

  async function checkout() {
    setPhase('processing');
    const outcome: LineResult[] = [];
    for (const line of lines) {
      let ok = 0;
      let failed = 0;
      let lastError: string | undefined;
      for (let i = 0; i < line.qty; i++) {
        // eslint-disable-next-line no-await-in-loop
        const res = await order(line.itemId, { mode: 'WALLET' });
        if (res.success) ok += 1;
        else { failed += 1; lastError = res.message; }
      }
      outcome.push({ itemId: line.itemId, title: line.title, ok, failed, lastError });
      // Retire du panier les unités effectivement commandées ; garde le reste (échecs) pour réessai.
      if (ok > 0) setQty(line.itemId, Math.max(0, line.qty - ok));
    }
    setResults(outcome);
    setPhase('done');
    refreshWallet();
  }

  if (phase === 'done') {
    const allOk = results.every((r) => r.failed === 0);
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>{allOk ? '✅' : '⚠️'}</div>
          <p>{allOk ? t('market.orderAllOk') : t('market.orderPartial')}</p>
        </div>
        <div className={styles.mineList}>
          {results.map((r) => (
            <div key={r.itemId} className={styles.mineRow}>
              <div className={styles.mineRowMain}>
                <div>
                  <div className={styles.mineRowTitle}>{r.title}</div>
                  <div className={styles.mineRowMeta}>
                    {r.ok > 0 && t('market.orderLineOk', { n: r.ok })}
                    {r.ok > 0 && r.failed > 0 ? ' · ' : ''}
                    {r.failed > 0 && t('market.orderLineFailed', { n: r.failed })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.buyActions}>
          <Link href="/marketplace/mine" className="btn btn-primary btn-lg">{t('market.viewPurchases')}</Link>
          <Link href="/marketplace" className="btn btn-ghost btn-lg">{t('market.backToList')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link href="/marketplace" className={styles.back}>← {t('market.backToList')}</Link>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('market.cartTitle')}</h1>
          <p className={styles.sub}>{t('market.cartSubtitle')}</p>
        </div>
      </header>

      {lines.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🛒</div>
          <p>{t('market.cartEmpty')}</p>
          <Link href="/marketplace" className="btn btn-primary">{t('market.backToList')}</Link>
        </div>
      ) : (
        <>
          <div className={styles.mineList}>
            {lines.map((l) => (
              <div key={l.itemId} className={styles.mineRow} id={`cart-line-${l.itemId}`}>
                <Link href={`/marketplace/${l.itemId}`} className={styles.mineRowMain}>
                  <div className={styles.mineThumb}>
                    {l.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.imageUrl} alt="" />
                    ) : <span>🛍️</span>}
                  </div>
                  <div>
                    <div className={styles.mineRowTitle}>{l.title}</div>
                    <div className={styles.mineRowMeta}>{formatNumber(l.price)} {fcfa(l.currency)}</div>
                  </div>
                </Link>
                <div className={styles.qtyRow}>
                  <button className={styles.qtyBtn} disabled={phase === 'processing'} onClick={() => setQty(l.itemId, l.qty - 1)} aria-label="-" id={`btn-qty-minus-${l.itemId}`}>−</button>
                  <span className={styles.qtyValue}>{l.qty}</span>
                  <button className={styles.qtyBtn} disabled={phase === 'processing'} onClick={() => setQty(l.itemId, l.qty + 1)} aria-label="+" id={`btn-qty-plus-${l.itemId}`}>+</button>
                  <button className={styles.removeBtn} disabled={phase === 'processing'} onClick={() => remove(l.itemId)} id={`btn-remove-${l.itemId}`}>{t('market.remove')}</button>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.cartSummary}>
            <div className={styles.modalRow}>
              <span>{t('market.total')}</span>
              <span>{formatNumber(total)} {fcfa(currency)}</span>
            </div>
            <div className={styles.modalRow}>
              <span>{t('market.yourBalance')}</span>
              <span>{formatNumber(balance)} {fcfa(currency)}</span>
            </div>
            {!canPay && lines.length > 0 && <div className={styles.modalError}>⚠️ {t('market.insufficient')}</div>}
          </div>

          <div className={styles.buyActions}>
            <button className="btn btn-primary btn-lg" disabled={!canPay || phase === 'processing'} onClick={checkout} id="btn-checkout">
              {phase === 'processing' ? t('market.processing') : `💰 ${t('market.payWithWallet')}`}
            </button>
            <button className="btn btn-ghost btn-lg" disabled={phase === 'processing'} onClick={() => { clear(); router.push('/marketplace'); }} id="btn-clear-cart">
              {t('market.clearCart')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
