'use client';
// ============================================================
// KESSIA — Livraison Miaride d'une commande marketplace (ADR 0042, 0045)
// Vue acheteur (demander / programmer / suivre) et vendeur (colis prêt).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import {
  useDeliveryActions,
  useDeliveryAddresses,
  type DeliveryInfo,
  type DeliveryQuote,
  type MyPurchase,
  type MySale,
} from '@/hooks/useMarketplace';
import { LOME_ZONES } from '@/lib/delivery/zones';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { formatNumber } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';
import styles from './delivery.module.css';

const STEPS: DeliveryInfo['status'][] = ['REQUESTED', 'COURIER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];
const TERMINAL = new Set<DeliveryInfo['status']>(['DELIVERED', 'CANCELLED']);

function stepLabel(t: ReturnType<typeof useT>, s: DeliveryInfo['status']): string {
  return t(`market.delivery.step.${s}`);
}

// ── Acheteur ─────────────────────────────────────────────────
export function BuyerDelivery({ purchase, onChange }: { purchase: MyPurchase; onChange: () => void }) {
  const t = useT();

  if (purchase.delivery?.status === 'SCHEDULED') {
    return <ScheduledDelivery purchase={purchase} onChange={onChange} />;
  }
  if (purchase.delivery) {
    return <DeliveryTimeline delivery={purchase.delivery} role="buyer" onChange={onChange} />;
  }
  if (purchase.coveredByDeliveryId) {
    return (
      <div className={styles.hint}>
        <Icon name="package" size={14} tinted /> {t('market.delivery.bundledHint')}
      </div>
    );
  }
  if (purchase.deliverable) return <RequestDelivery purchase={purchase} onChange={onChange} />;
  if (purchase.scheduleable) return <RequestDelivery purchase={purchase} onChange={onChange} schedule />;
  if (purchase.pickupMissing) {
    return <div className={styles.hint}><Icon name="package" size={14} tinted /> {t('market.delivery.pickupMissing')}</div>;
  }
  return null;
}

function ScheduledDelivery({ purchase, onChange }: { purchase: MyPurchase; onChange: () => void }) {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { act } = useDeliveryActions();
  const [busy, setBusy] = useState<string | null>(null);
  const d = purchase.delivery!;

  async function run(action: 'activate' | 'cancel') {
    setBusy(action);
    const r = await act(d.id, { action });
    setBusy(null);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) {
      if (action === 'activate') {
        const data = r.data as { handoffUrl?: string | null } | undefined;
        if (data?.handoffUrl) window.open(data.handoffUrl, '_blank', 'noopener');
      }
      onChange();
    }
  }

  return (
    <div className={styles.scheduled}>
      <div className={styles.tlHead}>
        <span className={styles.tlBadge}><Icon name="clock" size={13} /> {t('market.delivery.step.SCHEDULED')}</span>
      </div>
      <p className={styles.tlNote}>
        {t('market.delivery.scheduledNote', { zone: d.dropoffAddress })}
      </p>
      <div className={styles.tlActions}>
        <button
          className="btn btn-primary btn-sm"
          disabled={!!busy || !purchase.scheduledActivatable}
          onClick={() => run('activate')}
        >
          {t('market.delivery.activate')}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('cancel')}>
          {t('market.delivery.cancel')}
        </button>
      </div>
      {!purchase.scheduledActivatable && (
        <p className={styles.hint}>{t('market.delivery.activateHint')}</p>
      )}
    </div>
  );
}

function RequestDelivery({
  purchase,
  onChange,
  schedule = false,
  alsoOrderIds,
  triggerLabel,
}: {
  purchase: MyPurchase;
  onChange: () => void;
  schedule?: boolean;
  alsoOrderIds?: string[];
  triggerLabel?: string;
}) {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const phone = useAuthStore((s) => s.user?.phone) ?? '';
  const { quote, request } = useDeliveryActions();
  const { addresses } = useDeliveryAddresses();

  const [open, setOpen] = useState(false);
  const [addressId, setAddressId] = useState<string>('');
  const [zone, setZone] = useState('');
  const [address, setAddress] = useState('');
  const [recipient, setRecipient] = useState(phone);
  const [handoff, setHandoff] = useState(false);
  const [saveAddr, setSaveAddr] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [q, setQ] = useState<DeliveryQuote | null>(null);
  const [loadingQ, setLoadingQ] = useState(false);
  const [busy, setBusy] = useState(false);

  const usingBook = addressId !== '' && addressId !== '__new__';
  const effectiveZone = usingBook ? (addresses.find((a) => a.id === addressId)?.area ?? '') : zone;

  // Pré-sélection : adresse par défaut du carnet.
  useEffect(() => {
    if (open && addresses.length > 0 && addressId === '') {
      setAddressId(addresses.find((a) => a.isDefault)?.id ?? addresses[0].id);
    }
  }, [open, addresses, addressId]);

  useEffect(() => {
    if (!open || !effectiveZone) { setQ(null); return; }
    let cancelled = false;
    setLoadingQ(true);
    quote(purchase.id, effectiveZone).then((res) => { if (!cancelled) { setQ(res); setLoadingQ(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effectiveZone, purchase.id]);

  async function submit() {
    setBusy(true);
    const r = await request({
      orderId: purchase.id,
      alsoOrderIds,
      mode: handoff ? 'HANDOFF' : 'SIMULATED',
      schedule: schedule || undefined,
      ...(usingBook
        ? { addressId }
        : {
            dropoffZone: zone,
            dropoffAddress: address.trim(),
            recipientPhone: recipient.trim(),
            saveAddress: saveAddr || undefined,
            saveAddressLabel: saveAddr ? saveLabel.trim() || undefined : undefined,
          }),
    });
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) {
      const d = r.data as { handoffUrl?: string | null } | undefined;
      if (handoff && d?.handoffUrl) window.open(d.handoffUrl, '_blank', 'noopener');
      setOpen(false);
      onChange();
    }
  }

  const manualOk = zone && address.trim().length >= 5 && recipient.trim().length >= 8;
  const canSubmit = schedule
    ? (usingBook || manualOk)
    : (usingBook || manualOk) && (handoff || q?.covered);

  const title = schedule ? t('market.delivery.scheduleTitle') : t('market.delivery.modalTitle');

  return (
    <>
      <button className={styles.requestBtn} id={`btn-deliver-${purchase.id}`} onClick={() => setOpen(true)}>
        <Icon name={schedule ? 'clock' : 'mobile'} size={15} tinted />{' '}
        {triggerLabel ?? (schedule ? t('market.delivery.scheduleCta') : t('market.delivery.organize'))}
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title={title} locked={busy}>
        <div className={styles.form}>
          <p className={styles.preview}>
            <strong>{t('modulesPages.previewLabel')}</strong>{' '}
            {schedule ? t('market.delivery.schedulePreview') : t('market.delivery.previewBanner')}
          </p>

          {addresses.length > 0 && (
            <>
              <label className="label" htmlFor="dab">{t('market.delivery.savedAddress')}</label>
              <select id="dab" className="input" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} — {a.areaLabel ?? a.area}
                  </option>
                ))}
                <option value="__new__">{t('market.delivery.newAddress')}</option>
              </select>
            </>
          )}

          {!usingBook && (
            <>
              <label className="label" htmlFor="dz">{t('market.delivery.dropoffZone')}</label>
              <select id="dz" className="input" value={zone} onChange={(e) => setZone(e.target.value)}>
                <option value="">{t('market.delivery.chooseZone')}</option>
                {LOME_ZONES.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
              </select>

              <label className="label" htmlFor="da">{t('market.delivery.dropoffAddress')}</label>
              <input id="da" className="input" value={address} maxLength={240}
                placeholder={t('market.delivery.addressPlaceholder')} onChange={(e) => setAddress(e.target.value)} />

              <label className="label" htmlFor="dp">{t('market.delivery.recipientPhone')}</label>
              <input id="dp" className="input" value={recipient} maxLength={20} onChange={(e) => setRecipient(e.target.value)} />

              <label className={styles.handoffToggle}>
                <input type="checkbox" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} />
                <span><strong>{t('market.delivery.saveThisAddress')}</strong></span>
              </label>
              {saveAddr && (
                <input className="input" value={saveLabel} maxLength={40}
                  placeholder={t('market.delivery.saveAddressLabel')} onChange={(e) => setSaveLabel(e.target.value)} />
              )}
            </>
          )}

          {effectiveZone && !handoff && !schedule && (
            <div className={styles.quote}>
              {loadingQ ? <span>{t('common.loading')}</span>
                : q?.covered ? (
                  <>
                    <span>{t('market.delivery.estFee')}</span>
                    <strong>{formatNumber(q.amount)} FCFA · ~{q.etaMinutes} min</strong>
                  </>
                ) : <span className={styles.quoteWarn}><Icon name="urgent" size={13} tinted /> {t('market.delivery.notCovered')}</span>}
            </div>
          )}

          {q?.covered && !handoff && !schedule && (
            <div className={styles.total}>
              <span>{t('market.delivery.total')}</span>
              <strong>{formatNumber(purchase.amount + q.amount)} FCFA</strong>
              <span className={styles.totalNote}>{t('market.delivery.totalNote', { fee: formatNumber(q.amount) })}</span>
            </div>
          )}

          <label className={styles.handoffToggle}>
            <input type="checkbox" checked={handoff} onChange={(e) => setHandoff(e.target.checked)} />
            <span>
              <strong>{t('market.delivery.handoffTitle')}</strong>
              <span className={styles.hintText}>{t('market.delivery.handoffHint')}</span>
            </span>
          </label>

          <button className="btn btn-primary btn-lg btn-full" disabled={busy || !canSubmit} onClick={submit}>
            {busy ? t('market.processing')
              : schedule ? t('market.delivery.confirmSchedule')
              : handoff ? t('market.delivery.openMiaride')
              : t('market.delivery.confirmRequest')}
          </button>
        </div>
      </Modal>
    </>
  );
}

function DeliveryTimeline({ delivery, role, onChange }: { delivery: DeliveryInfo; role: 'buyer' | 'seller'; onChange: () => void }) {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { act } = useDeliveryActions();
  const [busy, setBusy] = useState<string | null>(null);

  const active = !TERMINAL.has(delivery.status);
  const idx = STEPS.indexOf(delivery.status);

  const doAct = useCallback(async (action: string) => {
    setBusy(action);
    const r = await act(delivery.id, { action });
    setBusy(null);
    if (action !== 'advance') addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) onChange();
  }, [act, delivery.id, addToast, onChange]);

  // Suivi simulé : on demande l'étape suivante toutes les 12 s, jusqu'à
  // « en route » (au-delà, c'est l'acheteur qui confirme la réception).
  const autoAdvancing = delivery.simulated && delivery.mode === 'SIMULATED' && active && delivery.status !== 'IN_TRANSIT';
  useEffect(() => {
    if (role !== 'buyer' || !autoAdvancing) return;
    const id = setInterval(() => { doAct('advance'); }, 12_000);
    return () => clearInterval(id);
  }, [role, autoAdvancing, doAct]);

  const showConfirm = role === 'buyer' && (delivery.status === 'IN_TRANSIT' || delivery.status === 'PICKED_UP');
  const showCancel = role === 'buyer' && (delivery.status === 'REQUESTED' || delivery.status === 'COURIER_ASSIGNED');
  const showReady = role === 'seller' && !delivery.sellerReadyAt && (delivery.status === 'REQUESTED' || delivery.status === 'COURIER_ASSIGNED');
  const showTracking = role === 'buyer' && delivery.mode === 'HANDOFF' && !delivery.providerRef;

  return (
    <div className={styles.timeline}>
      <div className={styles.tlHead}>
        <span className={styles.tlBadge}>
          <Icon name="mobile" size={13} /> Miaride{delivery.simulated ? ' · aperçu' : ''}
        </span>
        {delivery.extraItemCount > 0 && (
          <span className={styles.tlCourier}>{t('market.delivery.bundleCount', { n: delivery.extraItemCount + 1 })}</span>
        )}
        {delivery.courierName && <span className={styles.tlCourier}>{delivery.courierName}</span>}
        {delivery.trackingUrl && (
          <a href={delivery.trackingUrl} target="_blank" rel="noreferrer" className={styles.tlTrack}>
            {t('market.delivery.trackOnMiaride')} ↗
          </a>
        )}
      </div>

      {delivery.status === 'CANCELLED' ? (
        <div className={styles.tlCancelled}>{t('market.delivery.step.CANCELLED')}</div>
      ) : (
        <ol className={styles.tlSteps}>
          {STEPS.map((s, i) => (
            <li key={s} className={`${styles.tlStep} ${i <= idx ? styles.tlDone : ''} ${i === idx ? styles.tlCurrent : ''}`}>
              <span className={styles.tlDot} />
              <span>{stepLabel(t, s)}</span>
            </li>
          ))}
        </ol>
      )}

      {role === 'seller' && !delivery.sellerReadyAt && active && (
        <p className={styles.tlNote}>{t('market.delivery.sellerPrepare', { pickup: delivery.pickupLabel })}</p>
      )}

      <div className={styles.tlActions}>
        {showReady && (
          <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => doAct('ready')}>
            {t('market.delivery.markReady')}
          </button>
        )}
        {showConfirm && (
          <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => doAct('confirm')}>
            {t('market.delivery.confirmReceived')}
          </button>
        )}
        {showCancel && (
          <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => doAct('cancel')}>
            {t('market.delivery.cancel')}
          </button>
        )}
        {showTracking && <HandoffTracking deliveryId={delivery.id} onChange={onChange} />}
      </div>
    </div>
  );
}

function HandoffTracking({ deliveryId, onChange }: { deliveryId: string; onChange: () => void }) {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { act } = useDeliveryActions();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (code.trim().length < 3) return;
    setBusy(true);
    const r = await act(deliveryId, { action: 'tracking', code: code.trim() });
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) onChange();
  }

  return (
    <div className={styles.tracking}>
      <input className="input" value={code} placeholder={t('market.delivery.trackingCode')} maxLength={40}
        onChange={(e) => setCode(e.target.value)} />
      <button className="btn btn-secondary btn-sm" disabled={busy || code.trim().length < 3} onClick={save}>
        {t('common.save')}
      </button>
    </div>
  );
}

// ── Vendeur ──────────────────────────────────────────────────
export function SellerDeliveries({ sales, onChange }: { sales: MySale[]; onChange: () => void }) {
  const t = useT();
  const shown = useMemo(() => sales.filter((s) => s.delivery.status !== 'DELIVERED' && s.delivery.status !== 'CANCELLED'), [sales]);
  if (shown.length === 0) return null;
  return (
    <section className={styles.sellerBlock}>
      <h2 className={styles.sellerTitle}>{t('market.delivery.toPrepare')}</h2>
      <div className={styles.sellerList}>
        {shown.map((s) => (
          <div key={s.id} className={styles.sellerRow}>
            <div className={styles.sellerRowTitle}>
              {s.item.title}
              {s.settlement === 'ON_DELIVERY' && (
                <span className={styles.escrowTag}>{t('market.delivery.escrowTag')}</span>
              )}
            </div>
            <DeliveryTimeline delivery={s.delivery} role="seller" onChange={onChange} />
          </div>
        ))}
      </div>
    </section>
  );
}
