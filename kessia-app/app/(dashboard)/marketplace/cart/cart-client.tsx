'use client';
// ============================================================
// KESSIA Marketplace — Panier (ADR 0041 item 3, ADR 0045)
//
// Panier multi-articles CÔTÉ CLIENT (localStorage, store/cartStore).
// Au paiement, chaque unité de chaque ligne est envoyée à l'API
// EXISTANTE POST /marketplace/[id]/order (mode WALLET) — le même achat
// direct qu'avant (ADR 0039), simplement enchaîné plusieurs fois.
// Après paiement, la livraison est proposée REGROUPÉE PAR VENDEUR
// (une course Miaride par vendeur, ADR 0045).
// ============================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import { useMarketplaceActions, useDeliveryActions, useDeliveryAddresses } from '@/hooks/useMarketplace';
import { useWallet } from '@/hooks/useWallet';
import { LOME_ZONES } from '@/lib/delivery/zones';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { formatNumber } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';
import styles from '../marketplace.module.css';

function fcfa(c: string) {
  return c === 'XOF' || c === 'XAF' ? 'FCFA' : c;
}

type PlacedOrder = { orderId: string; itemId: string; title: string; sellerId: string | null; sellerName: string | null; pickupZone: string | null };
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
  const [placed, setPlaced] = useState<PlacedOrder[]>([]);

  const currency = lines[0]?.currency ?? 'XOF';
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const balance = wallet?.balance ?? 0;
  const canPay = lines.length > 0 && balance >= total;

  async function checkout() {
    setPhase('processing');
    const outcome: LineResult[] = [];
    const orders: PlacedOrder[] = [];
    for (const line of lines) {
      let ok = 0;
      let failed = 0;
      let lastError: string | undefined;
      for (let i = 0; i < line.qty; i++) {
        // eslint-disable-next-line no-await-in-loop
        const res = await order(line.itemId, { mode: 'WALLET' });
        if (res.success) {
          ok += 1;
          const d = res.data as { orderId?: string } | undefined;
          if (d?.orderId) {
            orders.push({
              orderId: d.orderId, itemId: line.itemId, title: line.title,
              sellerId: line.sellerId ?? null, sellerName: line.sellerName ?? null,
              pickupZone: line.pickupZone ?? null,
            });
          }
        } else { failed += 1; lastError = res.message; }
      }
      outcome.push({ itemId: line.itemId, title: line.title, ok, failed, lastError });
      if (ok > 0) setQty(line.itemId, Math.max(0, line.qty - ok));
    }
    setResults(outcome);
    setPlaced(orders);
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

        <CartDeliverySection placed={placed} />

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

// ── Livraison groupée par vendeur (ADR 0045) ─────────────────
function CartDeliverySection({ placed }: { placed: PlacedOrder[] }) {
  const t = useT();
  const groups = useMemo(() => {
    const m = new Map<string, PlacedOrder[]>();
    for (const o of placed) {
      if (!o.sellerId || !o.pickupZone) continue; // livraison Miaride indisponible
      const arr = m.get(o.sellerId) ?? [];
      arr.push(o);
      m.set(o.sellerId, arr);
    }
    return [...m.values()];
  }, [placed]);

  if (groups.length === 0) return null;

  return (
    <section className={styles.cartDelivery}>
      <h2 className={styles.mineRowTitle}>{t('market.delivery.cartTitle')}</h2>
      <p className={styles.mineRowMeta}>{t('market.delivery.cartHint')}</p>
      {groups.map((g) => (
        <CartDeliveryGroup key={g[0].sellerId} group={g} />
      ))}
    </section>
  );
}

function CartDeliveryGroup({ group }: { group: PlacedOrder[] }) {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const phone = useAuthStore((s) => s.user?.phone) ?? '';
  const { request } = useDeliveryActions();
  const { addresses } = useDeliveryAddresses();

  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addressId, setAddressId] = useState('');
  const [zone, setZone] = useState('');
  const [address, setAddress] = useState('');
  const [recipient, setRecipient] = useState(phone);

  const anchor = group[0];
  const usingBook = addressId !== '' && addressId !== '__new__';
  const manualOk = zone && address.trim().length >= 5 && recipient.trim().length >= 8;

  async function submit() {
    setBusy(true);
    const r = await request({
      orderId: anchor.orderId,
      alsoOrderIds: group.slice(1).map((o) => o.orderId),
      mode: 'SIMULATED',
      ...(usingBook
        ? { addressId }
        : { dropoffZone: zone, dropoffAddress: address.trim(), recipientPhone: recipient.trim() }),
    });
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) setDone(true);
  }

  if (done) {
    return (
      <div className={styles.cartDeliveryGroup}>
        <strong>{anchor.sellerName ?? t('market.community')}</strong> — {t('market.delivery.cartGroupDone')}
      </div>
    );
  }

  return (
    <div className={styles.cartDeliveryGroup}>
      <div className={styles.mineRowTitle}>
        {anchor.sellerName ?? t('market.community')} · {t('market.delivery.bundleCount', { n: group.length })}
      </div>
      <div className={styles.mineRowMeta}>{group.map((o) => o.title).join(', ')}</div>

      {addresses.length > 0 && (
        <select className="input" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
          <option value="">{t('market.delivery.chooseZone')}</option>
          {addresses.map((a) => (
            <option key={a.id} value={a.id}>{a.label} — {a.areaLabel ?? a.area}</option>
          ))}
          <option value="__new__">{t('market.delivery.newAddress')}</option>
        </select>
      )}

      {!usingBook && (
        <>
          <select className="input" value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">{t('market.delivery.chooseZone')}</option>
            {LOME_ZONES.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
          </select>
          <input className="input" value={address} maxLength={240}
            placeholder={t('market.delivery.addressPlaceholder')} onChange={(e) => setAddress(e.target.value)} />
          <input className="input" value={recipient} maxLength={20}
            onChange={(e) => setRecipient(e.target.value)} placeholder={t('market.delivery.recipientPhone')} />
        </>
      )}

      <button className="btn btn-primary btn-sm" disabled={busy || !(usingBook || manualOk)} onClick={submit}>
        {busy ? t('market.processing') : t('market.delivery.confirmRequest')}
      </button>
    </div>
  );
}
