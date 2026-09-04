'use client';
// ============================================================
// KESSIA — Wallet (Client Component)
// Solde, stats, historique + dépôt / transfert branchés sur l'API
// ============================================================

import { useEffect, useMemo, useRef, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import styles from './wallet.module.css';
import { Modal } from '@/components/ui/Modal';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { DraftNotice } from '@/components/ui/DraftNotice';
import { useFormDraft } from '@/hooks/useFormDraft';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/lib/i18n';
import { useWallet, type DepositMethod } from '@/hooks/useWallet';
import { useTontines } from '@/hooks/useTontines';
import {
  describeTransaction,
  formatNumber,
  formatRelativeDate,
  formatSignedAmount,
} from '@/lib/utils/format';

type ActionKey = 'deposit' | 'send' | 'receive' | 'withdraw' | 'airtime' | 'save';
type TxFilter = 'all' | 'CREDIT' | 'DEBIT';

const QUICK_ACTIONS: { icon: string; labelKey: string; key: ActionKey; id: string }[] = [
  { icon: '⬆️', labelKey: 'wallet.topUp', key: 'deposit', id: 'btn-deposit' },
  { icon: '➡️', labelKey: 'wallet.send', key: 'send', id: 'btn-send' },
  { icon: '⬇️', labelKey: 'wallet.receive', key: 'receive', id: 'btn-receive' },
  { icon: '⏬', labelKey: 'wallet.withdraw', key: 'withdraw', id: 'btn-withdraw' },
  { icon: '📱', labelKey: 'wallet.airtime', key: 'airtime', id: 'btn-airtime' },
  { icon: '💎', labelKey: 'wallet.savings', key: 'save', id: 'btn-save' },
];

const PRESETS = [5000, 10000, 25000, 50000, 100000];

function fcfa(currency: string) {
  return currency === 'XOF' || currency === 'XAF' ? 'FCFA' : currency;
}

export default function WalletClient() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isBalanceVisible = useUiStore((s) => s.isBalanceVisible);
  const toggleBalance = useUiStore((s) => s.toggleBalance);
  const addToast = useUiStore((s) => s.addToast);

  const phone = useAuthStore((s) => s.user?.phone ?? null);
  const { wallet, stats, transactions, isLoading, error, refresh, deposit, transfer, withdraw } = useWallet();

  const [modal, setModal] = useState<'deposit' | 'send' | 'receive' | 'withdraw' | 'savings' | null>(null);
  const [filter, setFilter] = useState<TxFilter>('all');
  const { tontines: goalTontines } = useTontines();

  // Ouvrir automatiquement la modale demandée via ?action=
  useEffect(() => {
    const action = searchParams.get('action') as ActionKey | null;
    if (action === 'deposit' || action === 'send' || action === 'receive' || action === 'withdraw' || action === 'save') {
      setModal(action === 'save' ? 'savings' : action);
    } else if (action === 'airtime') {
      addToast({ type: 'info', message: t('common.soon') });
      router.replace('/wallet');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleAction(key: ActionKey) {
    if (key === 'deposit' || key === 'send' || key === 'receive' || key === 'withdraw') {
      setModal(key);
    } else if (key === 'save') {
      setModal('savings');
    } else {
      addToast({ type: 'info', message: t('common.soon') });
    }
  }

  function closeModal() {
    setModal(null);
    if (searchParams.get('action')) router.replace('/wallet');
  }

  const currency = wallet?.currency ?? 'XOF';
  const monthlyNet = stats ? stats.monthlyIn - stats.monthlyOut : 0;

  const filteredTx = useMemo(() => {
    if (filter === 'all') return transactions;
    return transactions.filter((tx) => tx.direction === filter);
  }, [transactions, filter]);

  return (
    <div className={styles.page}>

      {/* ═══ HEADER ═══ */}
      <header className={styles.header}>
        <Link href="/home" className={styles.backBtn} aria-label={t('common.back')}>←</Link>
        <h1 className={styles.headerTitle}>{t('wallet.title')}</h1>
        <span className={styles.historyBtn} aria-hidden>📋</span>
      </header>

      {error && !isLoading && (
        <ErrorNote message={t('wallet.loadError')} onRetry={refresh} />
      )}

      {/* ═══ BALANCE CARD ═══ */}
      <section className={styles.balanceSection}>
        <div className={styles.balanceCard}>
          <div className={styles.cardGlow} />

          <div className={styles.cardTop}>
            <div className={styles.cardLabel}>{t('wallet.available')}</div>
            <button
              className={styles.eyeBtn}
              id="btn-eye"
              onClick={toggleBalance}
              aria-label={isBalanceVisible ? t('home.hideBalance') : t('home.showBalance')}
            >
              {isBalanceVisible ? '👁' : '🙈'}
            </button>
          </div>

          <div className={styles.balanceMain}>
            <span className={`${styles.balanceAmount} ${isLoading ? `${styles.skeleton} ${styles.skeletonLight}` : ''}`}>
              {isLoading ? '000 000' : isBalanceVisible ? formatNumber(wallet?.balance ?? 0) : '••••••'}
            </span>
            <span className={styles.balanceCurrency}>{fcfa(currency)}</span>
          </div>

          {!isLoading && stats && (
            <div className={styles.balanceChange}>
              <span className={styles.changeUp}>
                {monthlyNet >= 0 ? '↑ +' : '↓ −'}
                {formatNumber(Math.abs(monthlyNet))} {fcfa(currency)}
              </span>
              <span className={styles.changePeriod}>{t('home.thisMonth')}</span>
            </div>
          )}

          <div className={styles.cardStats}>
            <div className={styles.cardStat}>
              <span className={styles.cardStatLabel}>{t('wallet.inflow')}</span>
              <span className={styles.cardStatValue} style={{ color: '#86EFAC' }}>
                +{formatNumber(stats?.monthlyIn ?? 0)}
              </span>
            </div>
            <div className={styles.cardStatDivider} />
            <div className={styles.cardStat}>
              <span className={styles.cardStatLabel}>{t('wallet.outflow')}</span>
              <span className={styles.cardStatValue} style={{ color: '#FCA5A5' }}>
                -{formatNumber(stats?.monthlyOut ?? 0)}
              </span>
            </div>
            <div className={styles.cardStatDivider} />
            <div className={styles.cardStat}>
              <span className={styles.cardStatLabel}>{t('wallet.transactions')}</span>
              <span className={styles.cardStatValue} style={{ color: '#FCD34D' }}>
                {stats?.totalTransactions ?? 0}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ ACTIONS RAPIDES ═══ */}
      <section className={styles.section}>
        <div className={styles.actionsGrid}>
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => handleAction(a.key)}
              className={`${styles.actionItem} ${styles.actionBtn}`}
              id={a.id}
            >
              <div className={styles.actionIcon}>{a.icon}</div>
              <span className={styles.actionLabel}>{t(a.labelKey)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ═══ HISTORIQUE ═══ */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('wallet.history')}</h2>
          <div className={styles.filterRow}>
            {([
              ['all', t('wallet.filterAll')],
              ['CREDIT', t('wallet.filterIn')],
              ['DEBIT', t('wallet.filterOut')],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`${styles.filterBtn} ${filter === value ? styles.filterBtnActive : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.txList}>
          {isLoading &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className={styles.txItem}>
                <div className={styles.txIcon}>💰</div>
                <div className={styles.txInfo}>
                  <div className={`${styles.txTitle} ${styles.skeleton}`}>{t('common.loading')}</div>
                  <div className={`${styles.txSub} ${styles.skeleton}`}>·</div>
                </div>
              </div>
            ))}

          {!isLoading && filteredTx.length === 0 && (
            <div className={styles.emptyRow}>
              {transactions.length === 0
                ? t('home.noTransactions')
                : t('wallet.noTxFilter')}
            </div>
          )}

          {!isLoading &&
            filteredTx.map((tx) => {
              const { icon, label } = describeTransaction(tx.type, tx.description);
              return (
                <Link
                  key={tx.id}
                  href={`/documents/receipt/${tx.id}`}
                  className={styles.txItem}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                  title={t('wallet.viewReceipt')}
                >
                  <div className={styles.txIcon}>{icon}</div>
                  <div className={styles.txInfo}>
                    <div className={styles.txTitle}>{label}</div>
                    <div className={styles.txSub}>
                      <span>{formatRelativeDate(tx.createdAt)}</span>
                      <span className={styles.txCat}>
                        {tx.direction === 'CREDIT' ? t('wallet.in') : t('wallet.out')}
                      </span>
                    </div>
                  </div>
                  <div className={`${styles.txAmount} ${tx.direction === 'CREDIT' ? styles.credit : styles.debit}`}>
                    {formatSignedAmount(tx.amount, tx.direction)}
                    <span className={styles.fcfa}> {fcfa(tx.currency)}</span>
                  </div>
                </Link>
              );
            })}
        </div>
      </section>

      {/* ═══ MODALES ═══ */}
      <Modal open={modal === 'deposit'} onClose={closeModal} title={t('wallet.depositTitle')}>
        <DepositForm
          currency={currency}
          onSubmit={deposit}
          onDone={(msg) => {
            addToast({ type: 'success', message: msg });
            closeModal();
          }}
        />
      </Modal>

      <Modal open={modal === 'send'} onClose={closeModal} title={t('wallet.sendTitle')}>
        <TransferForm
          currency={currency}
          balance={wallet?.balance ?? 0}
          onSubmit={transfer}
          onDone={(msg) => {
            addToast({ type: 'success', message: msg });
            closeModal();
          }}
        />
      </Modal>

      <Modal open={modal === 'receive'} onClose={closeModal} title={t('wallet.receiveTitle')}>
        <ReceivePanel
          phone={phone}
          onCopied={() => addToast({ type: 'success', message: t('wallet.numberCopied') })}
        />
      </Modal>

      <Modal open={modal === 'withdraw'} onClose={closeModal} title={t('wallet.withdrawTitle')}>
        <DepositForm
          mode="withdraw"
          currency={currency}
          maxAmount={wallet?.balance ?? 0}
          onSubmit={(amount, method) => withdraw(amount, method)}
          onDone={(msg) => {
            addToast({ type: 'success', message: msg });
            closeModal();
          }}
        />
      </Modal>

      <Modal open={modal === 'savings'} onClose={closeModal} title={t('wallet.savingsTitle')}>
        <SavingsGoalsPanel tontines={goalTontines} currency={currency} />
      </Modal>
    </div>
  );
}

// ── Objectifs d'épargne (réutilise les plans d'Achat individuel) ──
// §6.4 — pas de nouveau mécanisme d'épargne : un « objectif » est ici
// une tontine Achat en mode Solo (séquestre + restitution déjà en
// place, ADR 0035). On les présente simplement sous l'angle « Épargne »
// pour coller au parcours attendu, sans dupliquer la logique.

function SavingsGoalsPanel({
  tontines,
  currency,
}: {
  tontines: { id: string; name: string; purchaseMode: string; type: string; purchaseItem: string | null; targetAmount: number | null; status: string; myMembership: { totalContributed: string } | null }[];
  currency: string;
}) {
  const t = useT();
  const goals = tontines.filter((tn) => tn.type === 'PURCHASE' && tn.purchaseMode === 'SOLO' && tn.status !== 'CANCELLED');

  return (
    <div className={styles.modalForm}>
      <p className={styles.modalHint}>{t('wallet.savingsHint')}</p>

      {goals.length === 0 ? (
        <div className={styles.goalEmpty}>{t('wallet.savingsEmpty')}</div>
      ) : (
        <div className={styles.goalList}>
          {goals.map((g) => {
            const target = g.targetAmount ?? 0;
            const contributed = Number(g.myMembership?.totalContributed ?? 0);
            const pct = target > 0 ? Math.min(100, Math.round((contributed / target) * 100)) : 0;
            const done = g.status === 'COMPLETED';
            return (
              <Link key={g.id} href={`/tontine/${g.id}`} className={styles.goalItem} id={`goal-${g.id}`}>
                <span className={styles.goalIcon}>💎</span>
                <div className={styles.goalBody}>
                  <div className={styles.goalName}>{g.purchaseItem || g.name}</div>
                  <div className={styles.goalMeta}>
                    {done
                      ? t('wallet.savingsDone')
                      : t('wallet.savingsProgress', { done: formatNumber(contributed), target: formatNumber(target), currency: fcfa(currency) })}
                  </div>
                  <div className={styles.goalBar}>
                    <div className={styles.goalBarFill} style={{ width: `${done ? 100 : pct}%` }} />
                  </div>
                </div>
                <span className={styles.goalPct}>{done ? '✓' : `${pct}%`}</span>
              </Link>
            );
          })}
        </div>
      )}

      <Link href="/tontine?type=purchase" className={styles.goalCreateLink} id="btn-new-goal">
        + {t('wallet.savingsNewGoal')}
      </Link>
    </div>
  );
}

// ── Recevoir (QR + numéro) ──────────────────────────────────

function ReceivePanel({ phone, onCopied }: { phone: string | null; onCopied: () => void }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Charge utile du QR : lien de paiement KESSIA (résolu par l'app)
  const payload = phone ? `https://kessia.app/pay?to=${encodeURIComponent(phone)}` : '';

  useEffect(() => {
    if (!canvasRef.current || !payload) return;
    QRCode.toCanvas(canvasRef.current, payload, {
      width: 200,
      margin: 1,
      color: { dark: '#1A1209', light: '#FFFFFF' },
    }).catch(() => {});
  }, [payload]);

  async function copy() {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      onCopied();
    } catch {
      /* ignore */
    }
  }

  async function share() {
    if (!phone) return;
    const text = t('wallet.shareText', { phone });
    if (navigator.share) {
      try { await navigator.share({ title: t('wallet.shareTitle'), text, url: payload }); } catch { /* annulé */ }
    } else {
      copy();
    }
  }

  if (!phone) {
    return <p className={styles.modalHint}>{t('wallet.noNumber')}</p>;
  }

  return (
    <div className={styles.receivePanel}>
      <p className={styles.modalHint}>
        {t('wallet.receiveHint')}
      </p>
      <div className={styles.qrWrap}>
        <canvas ref={canvasRef} width={200} height={200} />
      </div>
      <div className={styles.receivePhone}>{phone}</div>
      <div className={styles.receiveActions}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>{t('wallet.copy')}</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={share}>{t('wallet.share')}</button>
      </div>
    </div>
  );
}

// ── Formulaire de dépôt ─────────────────────────────────────

function DepositForm({
  currency,
  onSubmit,
  onDone,
  mode = 'deposit',
  maxAmount,
}: {
  currency: string;
  onSubmit: (amount: number, method: DepositMethod) => Promise<{ success: boolean; message: string }>;
  onDone: (message: string) => void;
  mode?: 'deposit' | 'withdraw';
  maxAmount?: number;
}) {
  const t = useT();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<DepositMethod>('MOBILE_MONEY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isWithdraw = mode === 'withdraw';

  const methods: { key: DepositMethod; label: string }[] = [
    { key: 'MOBILE_MONEY', label: t('wallet.methodMobileMoney') },
    { key: 'BANK_TRANSFER', label: t('wallet.methodBank') },
    { key: 'CASH', label: t('wallet.methodCash') },
  ];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!value || value <= 0) {
      setError(t('wallet.invalidAmount'));
      return;
    }
    if (isWithdraw && maxAmount !== undefined && value > maxAmount) {
      setError(t('wallet.amountTooHigh'));
      return;
    }
    setLoading(true);
    const result = await onSubmit(value, method);
    setLoading(false);
    if (result.success) onDone(result.message);
    else setError(result.message);
  }

  return (
    <form className={styles.modalForm} onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="label" htmlFor="deposit-amount">{t('wallet.amount')}</label>
        <div className={styles.currencyInput}>
          <input
            id="deposit-amount"
            type="number"
            inputMode="numeric"
            className="input"
            placeholder="0"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
          <span className={styles.currencySuffix}>{fcfa(currency)}</span>
        </div>
      </div>

      <div className={styles.presets}>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className={styles.presetBtn}
            onClick={() => setAmount(String(p))}
          >
            {formatNumber(p)}
          </button>
        ))}
      </div>

      <div className="form-group">
        <label className="label">{t('wallet.method')}</label>
        <div className={styles.methodRow}>
          {methods.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`${styles.methodBtn} ${method === m.key ? styles.methodBtnActive : ''}`}
              onClick={() => setMethod(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {isWithdraw && maxAmount !== undefined && (
        <p className={styles.modalHint}>{t('wallet.balanceLine', { amount: formatNumber(maxAmount), currency: fcfa(currency) })}</p>
      )}

      <p className={styles.modalHint}>
        {isWithdraw ? t('wallet.demoHintWithdraw') : t('wallet.demoHintDeposit')}
      </p>

      {error && <div className={styles.modalError}>⚠️ {error}</div>}

      <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
        {loading ? t('wallet.processing') : isWithdraw ? t('wallet.confirmWithdraw') : t('wallet.confirmDeposit')}
      </button>
    </form>
  );
}

// ── Formulaire de transfert ─────────────────────────────────

function TransferForm({
  currency,
  balance,
  onSubmit,
  onDone,
}: {
  currency: string;
  balance: number;
  onSubmit: (phone: string, amount: number, description?: string) => Promise<{ success: boolean; message: string }>;
  onDone: (message: string) => void;
}) {
  const t = useT();
  const { draft, draftAt, hasDraft, save: saveDraft, clear: clearDraft, dismiss: dismissDraft } =
    useFormDraft<{ phone: string; amount: string; note: string }>('wallet-transfer');
  const [phone, setPhone] = useState(draft?.phone ?? '');
  const [amount, setAmount] = useState(draft?.amount ?? '');
  const [note, setNote] = useState(draft?.note ?? '');
  const [showDraft, setShowDraft] = useState(hasDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { saveDraft({ phone, amount, note }); }, [phone, amount, note, saveDraft]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    const phoneRaw = phone.replace(/\s/g, '');
    if (phoneRaw.length < 8) {
      setError(t('wallet.invalidRecipient'));
      return;
    }
    if (!value || value <= 0) {
      setError(t('wallet.invalidAmount'));
      return;
    }
    if (value > balance) {
      setError(t('wallet.insufficientBalance'));
      return;
    }
    const normalized = phoneRaw.startsWith('+') ? phoneRaw : `+228${phoneRaw}`;
    setLoading(true);
    const result = await onSubmit(normalized, value, note.trim() || undefined);
    setLoading(false);
    if (result.success) { clearDraft(); onDone(result.message); }
    else setError(result.message);
  }

  return (
    <form className={styles.modalForm} onSubmit={handleSubmit}>
      {showDraft && (
        <DraftNotice
          at={draftAt ?? Date.now()}
          onDismiss={() => { setPhone(''); setAmount(''); setNote(''); dismissDraft(); setShowDraft(false); }}
        />
      )}
      <div className="form-group">
        <label className="label" htmlFor="transfer-phone">{t('wallet.recipientPhone')}</label>
        <input
          id="transfer-phone"
          type="tel"
          className="input"
          placeholder="+228 90 00 00 00"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoFocus
        />
      </div>

      <div className="form-group">
        <label className="label" htmlFor="transfer-amount">{t('wallet.amount')}</label>
        <div className={styles.currencyInput}>
          <input
            id="transfer-amount"
            type="number"
            inputMode="numeric"
            className="input"
            placeholder="0"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <span className={styles.currencySuffix}>{fcfa(currency)}</span>
        </div>
        <p className={styles.modalHint}>
          {t('wallet.balanceLine', { amount: formatNumber(balance), currency: fcfa(currency) })}
        </p>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="transfer-note">{t('wallet.note')}</label>
        <input
          id="transfer-note"
          type="text"
          className="input"
          placeholder={t('wallet.notePlaceholder')}
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error && <div className={styles.modalError}>⚠️ {error}</div>}

      <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
        {loading ? t('wallet.sending') : t('wallet.send')}
      </button>
    </form>
  );
}
