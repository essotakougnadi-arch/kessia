'use client';
// ============================================================
// KESSIA — Marketplace : détail d'un article + achat (§16)
//  wallet  → débit immédiat, crédit du vendeur
//  tontine → crée un plan d'épargne (tontine Achat SOLO) pré-rempli
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { useMarketplaceItem, useMarketplaceActions } from '@/hooks/useMarketplace';
import { useWallet } from '@/hooks/useWallet';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useCartStore } from '@/store/cartStore';
import { installmentAmount } from '@/lib/marketplace/marketplace';
import { formatNumber } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';
import styles from '../marketplace.module.css';

function fcfa(c: string) {
  return c === 'XOF' || c === 'XAF' ? 'FCFA' : c;
}

export default function ItemClient({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const { item, isLoading, error, refresh } = useMarketplaceItem(id);
  const { wallet } = useWallet();
  const userId = useAuthStore((s) => s.user?.id);
  const addToast = useUiStore((s) => s.addToast);
  const { order } = useMarketplaceActions();
  const addToCart = useCartStore((s) => s.add);

  const [mode, setMode] = useState<'WALLET' | 'TONTINE' | null>(null);
  const [installments, setInstallments] = useState(6);
  const [busy, setBusy] = useState(false);

  if (isLoading) {
    return <div className={styles.page}><div className={styles.detailSkeleton} /></div>;
  }
  if (error || !item) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🚫</div>
          <p>{error?.message ?? t('market.notFound')}</p>
          <Link href="/marketplace" className="btn btn-ghost">{t('market.backToList')}</Link>
        </div>
      </div>
    );
  }

  const isSeller = item.sellerId === userId;
  const soldOut = item.stock <= 0 || item.status !== 'ACTIVE';
  const balance = wallet?.balance ?? 0;
  const perPayment = installmentAmount(item.price, installments);

  async function confirm() {
    if (!mode) return;
    setBusy(true);
    const res = await order(id, mode === 'WALLET' ? { mode: 'WALLET' } : { mode: 'TONTINE', installments });
    setBusy(false);
    addToast({ type: res.success ? 'success' : 'error', message: res.message });
    if (res.success) {
      setMode(null);
      const d = res.data as { tontineId?: string } | undefined;
      if (mode === 'TONTINE' && d?.tontineId) router.push(`/tontine/${d.tontineId}`);
      else { refresh(); router.push('/marketplace/mine'); }
    }
  }

  return (
    <div className={styles.page}>
      <Link href="/marketplace" className={styles.back}>← {t('market.backToList')}</Link>

      <div className={styles.detail}>
        <div className={styles.detailImg}>
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt={item.title} />
          ) : (
            <span className={styles.thumbFallback}>🛍️</span>
          )}
        </div>

        <div className={styles.detailInfo}>
          <h1 className={styles.detailTitle}>{item.title}</h1>
          <div className={styles.detailPrice}>
            {formatNumber(item.price)} <span>{fcfa(item.currency)}</span>
          </div>

          <div className={styles.detailMeta}>
            <span>{item.businessName || item.sellerName || t('market.community')}</span>
            {item.city && <span>· {item.city}</span>}
            {item.category && <span>· {t(`market.category.${item.category}`, item.category)}</span>}
          </div>

          {item.payableByTontine && (
            <div className={styles.tontineHint}>
              🔄 {t('market.tontineHint', {
                n: item.tontineInstallments ?? 6,
                amount: formatNumber(item.tontineInstallmentAmount ?? installmentAmount(item.price, item.tontineInstallments ?? 6)),
                cur: fcfa(item.currency),
              })}
            </div>
          )}

          {item.description && <p className={styles.detailDesc}>{item.description}</p>}

          {isSeller ? (
            <div className={styles.ownNote}>
              {t('market.ownItem')} · <Link href="/marketplace/mine" className="text-primary">{t('market.manage')}</Link>
            </div>
          ) : soldOut ? (
            <div className={styles.ownNote}>{t('market.soldOut')}</div>
          ) : (
            <div className={styles.buyActions}>
              <button className="btn btn-primary btn-lg" id="btn-buy-wallet" onClick={() => setMode('WALLET')}>
                💰 {t('market.buyWallet')}
              </button>
              {item.payableByTontine && (
                <button className="btn btn-secondary btn-lg" id="btn-buy-tontine" onClick={() => { setInstallments(item.tontineInstallments ?? 6); setMode('TONTINE'); }}>
                  🔄 {t('market.buyTontine')}
                </button>
              )}
              <button
                className="btn btn-ghost btn-lg"
                id="btn-add-cart-detail"
                onClick={() => {
                  addToCart({ id: item.id, title: item.title, price: item.price, currency: item.currency, imageUrl: item.imageUrl });
                  addToast({ type: 'success', message: t('market.addedToCart', { title: item.title }) });
                }}
              >
                🛒 {t('market.addToCart')}
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={mode !== null}
        onClose={() => !busy && setMode(null)}
        title={mode === 'TONTINE' ? t('market.tontineModalTitle') : t('market.walletModalTitle')}
        locked={busy}
      >
        {mode === 'WALLET' && (
          <div className={styles.modalBody}>
            <div className={styles.modalAmount}>{formatNumber(item.price)} {fcfa(item.currency)}</div>
            <div className={styles.modalRow}><span>{t('market.article')}</span><span>{item.title}</span></div>
            <div className={styles.modalRow}><span>{t('market.yourBalance')}</span><span>{formatNumber(balance)} {fcfa(item.currency)}</span></div>
            {balance < item.price && <div className={styles.modalError}>⚠️ {t('market.insufficient')}</div>}
            <button className="btn btn-primary btn-lg btn-full" disabled={busy || balance < item.price} onClick={confirm}>
              {busy ? t('market.processing') : t('market.confirmPay')}
            </button>
          </div>
        )}

        {mode === 'TONTINE' && (
          <div className={styles.modalBody}>
            <p className={styles.modalIntro}>{t('market.tontineModalIntro')}</p>
            <label className="label" htmlFor="mkt-installments">{t('market.installments')}</label>
            <input
              id="mkt-installments"
              type="number"
              className="input"
              min={2}
              max={24}
              value={installments}
              onChange={(e) => setInstallments(Math.max(2, Math.min(24, Number(e.target.value) || 2)))}
            />
            <div className={styles.modalRow}>
              <span>{t('market.perPayment')}</span>
              <span>{formatNumber(perPayment)} {fcfa(item.currency)} × {installments}</span>
            </div>
            <div className={styles.modalRow}><span>{t('market.target')}</span><span>{formatNumber(item.price)} {fcfa(item.currency)}</span></div>
            <button className="btn btn-primary btn-lg btn-full" disabled={busy} onClick={confirm}>
              {busy ? t('market.processing') : t('market.createPlan')}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
