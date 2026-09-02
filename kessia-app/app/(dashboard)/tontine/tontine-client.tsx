'use client';
// ============================================================
// KESSIA — Tontines (Client Component)
// Liste réelle + création + les 4 types de tontines (§6.4)
// ============================================================

import { useEffect, useMemo, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './tontine.module.css';
import { Modal } from '@/components/ui/Modal';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import { useTontines } from '@/hooks/useTontines';
import { formatDate, formatNumber } from '@/lib/utils/format';
import { TONTINE_TYPES, type TontineTypeMeta } from '@/lib/tontine/type-meta';
import { useTontineTypeMeta, useTontineTypeList } from '@/lib/tontine/type-meta-i18n';
import type { TontineFrequency, TontineType } from '@prisma/client';

function fcfa(currency: string) {
  return currency === 'XOF' || currency === 'XAF' ? 'FCFA' : currency;
}

export default function TontineClient() {
  const t = useT();
  const typeMeta = useTontineTypeMeta();
  const typeList = useTontineTypeList();
  const router = useRouter();
  const searchParams = useSearchParams();

  const addToast = useUiStore((s) => s.addToast);
  const { tontines, isLoading, error, refresh, createTontine, joinByCode } = useTontines();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [createType, setCreateType] = useState<TontineType>('CLASSIC_ROTATING');
  const [typeInfo, setTypeInfo] = useState<TontineTypeMeta | null>(null);

  useEffect(() => {
    if (searchParams.get('create')) setShowCreate(true);
    if (searchParams.get('join')) setShowJoin(true);
    const qType = searchParams.get('type')?.toUpperCase();
    if (qType && TONTINE_TYPES.some((x) => x.key === qType)) {
      setCreateType(qType as TontineType);
      setShowCreate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function closeCreate() {
    setShowCreate(false);
    if (searchParams.get('create') || searchParams.get('type')) router.replace('/tontine');
  }
  function closeJoin() {
    setShowJoin(false);
    if (searchParams.get('join')) router.replace('/tontine');
  }

  async function handleJoin(code: string): Promise<{ success: boolean; message: string }> {
    const res = await joinByCode(code.trim().toUpperCase());
    if (res.success) {
      addToast({ type: 'success', message: res.message, duration: 6000 });
      closeJoin();
      if (res.tontineId) router.push(`/tontine/${res.tontineId}`);
    }
    return res;
  }

  const active = tontines.filter((tn) => tn.status === 'ACTIVE' || tn.status === 'PENDING');

  const isSoloTontine = (tn: { type: string; purchaseMode?: string }) =>
    tn.type === 'PURCHASE' && tn.purchaseMode === 'SOLO';

  const myTurn = active.find(
    (tn) =>
      tn.status === 'ACTIVE' &&
      !isSoloTontine(tn) &&
      tn.myMembership?.orderPosition != null &&
      tn.myMembership.orderPosition === tn.currentRound
  );

  // ── Résumé ────────────────────────────────────────────────
  const summary = useMemo(() => {
    const saved = tontines.reduce((s, tn) => s + Number(tn.myMembership?.totalContributed ?? 0), 0);
    const upcoming = active
      .map((tn) => (tn.nextContributionDate ? new Date(tn.nextContributionDate) : null))
      .filter((d): d is Date => d !== null && d.getTime() >= Date.now() - 86_400_000)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return { count: active.length, saved, upcoming };
  }, [tontines, active]);

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>{t('home.myTontines')}</h1>
          <div className={styles.headerSub}>
            {isLoading ? '…' : t('tontine.activeCount', { count: active.length })}
          </div>
        </div>
        <button className={`btn btn-sm ${styles.createBtn}`} id="btn-create-tontine" onClick={() => setShowCreate(true)}>
          {t('tontine.createShort')}
        </button>
      </header>

      {error && !isLoading && (
        <ErrorNote message={t('tontine.loadError')} onRetry={refresh} />
      )}

      {/* Résumé */}
      {!isLoading && tontines.length > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{summary.count}</div>
            <div className={styles.summaryLabel}>{t('tontine.summaryActive')}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>
              {formatNumber(summary.saved)} <small>FCFA</small>
            </div>
            <div className={styles.summaryLabel}>{t('tontine.summarySaved')}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>
              {summary.upcoming ? formatDate(summary.upcoming.toISOString()) : '—'}
            </div>
            <div className={styles.summaryLabel}>{t('tontine.summaryNext')}</div>
          </div>
        </div>
      )}

      {/* Alert — Mon tour */}
      {myTurn && (
        <div className={styles.myTurnAlert}>
          <span className={styles.alertIcon}>🎉</span>
          <div>
            <div className={styles.alertTitle}>{t('tontine.yourTurn')}</div>
            <div className={styles.alertDesc}>
              {t('tontine.willReceive', {
                name: myTurn.name,
                amount: formatNumber(myTurn.amount * myTurn.memberCount),
                currency: fcfa(myTurn.currency),
                date: myTurn.nextContributionDate ? t('tontine.onDate', { date: formatDate(myTurn.nextContributionDate) }) : '',
              })}
            </div>
          </div>
          <Link href={`/tontine/${myTurn.id}`} className={styles.alertBtn} id="btn-alert-details">{t('tontine.see')}</Link>
        </div>
      )}

      {/* Liste des tontines */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('tontine.sectionActive')}</h2>
        <div className={styles.tontineList}>
          {isLoading && (
            <div className={styles.tontineCard}>
              <div className={styles.tontineCardHeader}>
                <div className={styles.tontineIcon}>🔄</div>
                <div className={styles.tontineInfo}>
                  <div className={`${styles.tontiName} ${styles.skeleton}`}>{t('common.loading')}</div>
                  <div className={`${styles.tontiMeta} ${styles.skeleton}`}>— {t('home.members')}</div>
                </div>
              </div>
            </div>
          )}

          {!isLoading && active.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🔄</div>
              <div className={styles.emptyTitle}>{t('tontine.emptyTitle')}</div>
              <div className={styles.emptyDesc}>{t('tontine.emptyDesc')}</div>
            </div>
          )}

          {!isLoading && active.map((tn) => {
            const meta = typeMeta(tn.type);
            const isSolo = tn.type === 'PURCHASE' && tn.purchaseMode === 'SOLO';
            const pct = tn.totalRounds > 0 ? Math.round((tn.currentRound / tn.totalRounds) * 100) : 0;
            const pot = isSolo
              ? (tn.targetAmount ?? tn.amount * tn.totalRounds)
              : tn.amount * tn.memberCount;
            const isMyTurn =
              tn.status === 'ACTIVE' &&
              !isSolo &&
              tn.myMembership?.orderPosition != null &&
              tn.myMembership.orderPosition === tn.currentRound;
            return (
              <Link key={tn.id} href={`/tontine/${tn.id}`} className={styles.tontineCard} id={`btn-tontine-${tn.id}`}>
                <div className={styles.tontineCardHeader}>
                  <div
                    className={styles.tontineIcon}
                    style={{ background: `${meta.accent}1F`, color: meta.accent }}
                  >
                    {meta.icon}
                  </div>
                  <div className={styles.tontineInfo}>
                    <div className={styles.tontiName}>{tn.name}</div>
                    <div className={styles.tontiMeta}>
                      {isSolo
                        ? `${t('tontineDetail.soloPlanBadge')} · ${t(`freq.${tn.frequency}`)}`
                        : `${tn.memberCount} ${tn.memberCount > 1 ? t('home.members') : t('home.member')} · ${t(`freq.${tn.frequency}`)}`}
                    </div>
                  </div>
                  <span className={styles.typeBadge} style={{ background: `${meta.accent}1F`, color: meta.accent }}>
                    {meta.label}
                  </span>
                  {isMyTurn && <span className={styles.myTurnBadge}>{t('tontine.myTurnBadge')}</span>}
                  {!isMyTurn && tn.status === 'PENDING' && <span className={styles.myTurnBadge}>{t('tontine.pending')}</span>}
                </div>

                <div className={styles.tontineStats}>
                  <div className={styles.tontineStatItem}>
                    <span className={styles.statLabel}>{t('tontine.stake')}</span>
                    <span className={styles.statValue}>{formatNumber(tn.amount)} {fcfa(tn.currency)}</span>
                  </div>
                  <div className={styles.tontineStatItem}>
                    <span className={styles.statLabel}>{meta.distribution === 'growth' || isSolo ? t('tontine.goal') : t('tontine.pot')}</span>
                    <span className={styles.statValuePrimary}>{formatNumber(pot)} {fcfa(tn.currency)}</span>
                  </div>
                  <div className={styles.tontineStatItem}>
                    <span className={styles.statLabel}>{t('tontine.roundLabel')}</span>
                    <span className={styles.statValue}>{tn.currentRound}/{tn.totalRounds}</span>
                  </div>
                </div>

                <div className={styles.progressWrapper}>
                  <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${pct}%` }} /></div>
                  <div className={styles.progressMeta}>
                    <span>{t('tontine.pctComplete', { pct })}</span>
                    <span>
                      {tn.nextContributionDate ? t('home.nextDue', { date: formatDate(tn.nextContributionDate) }) : t('tontine.notStarted')}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Créer / Rejoindre */}
      <section className={styles.section}>
        <button className={styles.createCard} id="btn-create-tontine-card" onClick={() => setShowCreate(true)}>
          <div className={styles.createCardIcon}>+</div>
          <div>
            <div className={styles.createCardTitle}>{t('tontine.createCardTitle')}</div>
            <div className={styles.createCardSub}>{t('tontine.createCardSub')}</div>
          </div>
        </button>
        <button className={styles.joinCard} id="btn-join-tontine" onClick={() => setShowJoin(true)}>
          <div className={styles.joinCardIcon}>🔗</div>
          <div>
            <div className={styles.joinCardTitle}>{t('tontine.joinCardTitle')}</div>
            <div className={styles.joinCardSub}>{t('tontine.joinCardSub')}</div>
          </div>
        </button>
      </section>

      {/* Les 4 types de tontines */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('tontine.fourTypes')}</h2>
        <p className={styles.sectionHint}>{t('tontine.typesHint')}</p>
        <div className={styles.typesGrid}>
          {typeList.map((m) => (
            <button key={m.key} className={styles.typeCard} onClick={() => setTypeInfo(m)}>
              <div className={styles.typeCardIcon} style={{ background: `${m.accent}1F`, color: m.accent }}>
                {m.icon}
              </div>
              <div className={styles.typeCardLabel}>Tontine {m.label}</div>
              <div className={styles.typeCardTagline}>{m.tagline}</div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Modales ── */}
      <Modal open={showCreate} onClose={closeCreate} title={t('tontine.createTitle')}>
        <CreateTontineForm
          type={createType}
          onType={setCreateType}
          onSubmit={createTontine}
          onDone={(msg) => {
            addToast({ type: 'success', message: msg, duration: 7000 });
            closeCreate();
          }}
        />
      </Modal>

      <Modal open={showJoin} onClose={closeJoin} title={t('tontine.joinTitle')}>
        <JoinTontineForm onSubmit={handleJoin} />
      </Modal>

      <Modal open={typeInfo !== null} onClose={() => setTypeInfo(null)} title={typeInfo ? `Tontine ${typeInfo.label}` : ''}>
        {typeInfo && (
          <div>
            <div className={styles.typeDetailHead}>
              <div className={styles.typeDetailIcon} style={{ background: `${typeInfo.accent}1F`, color: typeInfo.accent }}>
                {typeInfo.icon}
              </div>
              <div>
                <div className={styles.typeDetailTitle}>Tontine {typeInfo.label}</div>
                <div className={styles.typeDetailTagline}>{typeInfo.tagline}</div>
              </div>
            </div>
            <p className={styles.typeDetailDesc}>{typeInfo.description}</p>
            <ol className={styles.typeSteps}>
              {typeInfo.howItWorks.map((step, i) => (
                <li key={i}>
                  <span className={styles.typeStepNum}>{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <button
              className="btn btn-primary btn-lg btn-full"
              style={{ marginTop: 18 }}
              onClick={() => { setCreateType(typeInfo.key); setTypeInfo(null); setShowCreate(true); }}
            >
              {t('tontine.createTypeCta', { label: typeInfo.label })}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Formulaire pour rejoindre par code ──────────────────────

function JoinTontineForm({
  onSubmit,
}: {
  onSubmit: (code: string) => Promise<{ success: boolean; message: string }>;
}) {
  const t = useT();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (code.trim().length < 4) return setError(t('tontine.joinCodeError'));
    setLoading(true);
    const res = await onSubmit(code);
    setLoading(false);
    if (!res.success) setError(res.message);
  }

  return (
    <form className={styles.modalForm} onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="label" htmlFor="t-join-code">{t('tontine.inviteCode')}</label>
        <input
          id="t-join-code"
          className="input"
          placeholder="KESS-XXXXXX"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={32}
          autoFocus
          style={{ textTransform: 'uppercase', letterSpacing: 1 }}
        />
      </div>
      <p className={styles.modalHint}>
        {t('tontine.joinHint')}
      </p>
      {error && <div className={styles.modalError}>⚠️ {error}</div>}
      <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
        {loading ? t('tontine.validating') : t('tontine.join')}
      </button>
    </form>
  );
}

// ── Formulaire de création ──────────────────────────────────

type PurchaseModeChoice = 'GROUP' | 'SOLO';

function CreateTontineForm({
  type,
  onType,
  onSubmit,
  onDone,
}: {
  type: TontineType;
  onType: (t: TontineType) => void;
  onSubmit: (p: {
    name: string;
    amount: number;
    frequency: TontineFrequency;
    startDate: string;
    maxMembers: number;
    description?: string;
    type?: TontineType;
    purchaseMode?: PurchaseModeChoice;
    purchaseItem?: string;
    targetAmount?: number;
    plannedRounds?: number;
  }) => Promise<{ success: boolean; message: string }>;
  onDone: (message: string) => void;
}) {
  const t = useT();
  const typeMeta = useTontineTypeMeta();
  const typeList = useTontineTypeList();
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [maxMembers, setMaxMembers] = useState('');
  const [frequency, setFrequency] = useState<TontineFrequency>('MONTHLY');
  const [startDate, setStartDate] = useState(today);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Achat : groupe (défaut) ou individuel
  const [purchaseMode, setPurchaseMode] = useState<PurchaseModeChoice>('GROUP');
  const [purchaseItem, setPurchaseItem] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [plannedRounds, setPlannedRounds] = useState('');

  const meta = typeMeta(type);
  const isPurchase = type === 'PURCHASE';
  const isSolo = isPurchase && purchaseMode === 'SOLO';
  const distribution = isSolo ? 'solo' : meta.distribution;

  const soloTarget = Number(targetAmount) || 0;
  const soloRounds = Number(plannedRounds) || 0;
  const soloPerPayment = soloTarget > 0 && soloRounds > 0 ? Math.max(1, Math.round(soloTarget / soloRounds)) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 3) return setError(t('tontine.nameError'));
    if (!startDate) return setError(t('tontine.dateError'));

    if (isSolo) {
      if (purchaseItem.trim().length < 2) return setError(t('tontine.soloItemError'));
      if (!soloTarget || soloTarget <= 0) return setError(t('tontine.soloTargetError'));
      if (!soloRounds || soloRounds < 2 || soloRounds > 60) return setError(t('tontine.soloRoundsError'));

      setLoading(true);
      const result = await onSubmit({
        name: name.trim(),
        type,
        purchaseMode: 'SOLO',
        purchaseItem: purchaseItem.trim(),
        targetAmount: soloTarget,
        plannedRounds: soloRounds,
        amount: soloPerPayment,
        frequency,
        startDate: new Date(`${startDate}T09:00:00`).toISOString(),
        maxMembers: 1,
        description: description.trim() || undefined,
      });
      setLoading(false);
      if (result.success) onDone(result.message);
      else setError(result.message);
      return;
    }

    const amountValue = Number(amount);
    if (!amountValue || amountValue <= 0) return setError(t('tontine.amountError'));
    const members = Number(maxMembers);
    if (!members || members < 2 || members > 50) return setError(t('tontine.membersError'));

    setLoading(true);
    const result = await onSubmit({
      name: name.trim(),
      amount: amountValue,
      frequency,
      startDate: new Date(`${startDate}T09:00:00`).toISOString(),
      maxMembers: members,
      description: description.trim() || undefined,
      type,
      purchaseMode: isPurchase ? 'GROUP' : undefined,
    });
    setLoading(false);
    if (result.success) onDone(result.message);
    else setError(result.message);
  }

  const freqs: TontineFrequency[] = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'];
  const cur = 'FCFA';

  return (
    <form className={styles.modalForm} onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="label">{t('tontine.typeLabel')}</label>
        <div className={styles.typePicker}>
          {typeList.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`${styles.typePick} ${type === m.key ? styles.typePickActive : ''}`}
              onClick={() => onType(m.key)}
              aria-pressed={type === m.key}
            >
              <div className={styles.typePickTop}>
                <span style={{ fontSize: 16 }}>{m.icon}</span>
                <span className={styles.typePickLabel}>{m.label}</span>
              </div>
              <span className={styles.typePickTagline}>{m.tagline}</span>
            </button>
          ))}
        </div>
        <p className={styles.modalHint} style={{ marginTop: 6 }}>{meta.description}</p>
      </div>

      {isPurchase && (
        <div className="form-group">
          <label className="label">{t('tontine.purchaseModeLabel')}</label>
          <div className={styles.typePicker}>
            {(['GROUP', 'SOLO'] as PurchaseModeChoice[]).map((pm) => (
              <button
                key={pm}
                type="button"
                className={`${styles.typePick} ${purchaseMode === pm ? styles.typePickActive : ''}`}
                onClick={() => setPurchaseMode(pm)}
                aria-pressed={purchaseMode === pm}
              >
                <div className={styles.typePickTop}>
                  <span style={{ fontSize: 16 }}>{pm === 'SOLO' ? '🧍' : '👥'}</span>
                  <span className={styles.typePickLabel}>
                    {pm === 'SOLO' ? t('tontine.purchaseModeSolo') : t('tontine.purchaseModeGroup')}
                  </span>
                </div>
                <span className={styles.typePickTagline}>
                  {pm === 'SOLO' ? t('tontine.purchaseModeSoloHint') : t('tontine.purchaseModeGroupHint')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="label" htmlFor="t-name">{t('tontine.nameLabel')}</label>
        <input id="t-name" className="input" placeholder={t('tontine.namePlaceholder')}
          value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      </div>

      {isSolo ? (
        <>
          <div className="form-group">
            <label className="label" htmlFor="t-item">{t('tontine.soloItemLabel')}</label>
            <input id="t-item" className="input" placeholder={t('tontine.soloItemPlaceholder')}
              maxLength={120} value={purchaseItem} onChange={(e) => setPurchaseItem(e.target.value)} />
          </div>
          <div className={styles.modalRow}>
            <div className="form-group">
              <label className="label" htmlFor="t-target">{t('tontine.soloTargetLabel')}</label>
              <input id="t-target" type="number" inputMode="numeric" className="input" placeholder="240 000"
                min={1} value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="t-rounds">{t('tontine.soloRoundsLabel')}</label>
              <input id="t-rounds" type="number" inputMode="numeric" className="input" placeholder="6"
                min={2} max={60} value={plannedRounds} onChange={(e) => setPlannedRounds(e.target.value)} />
            </div>
          </div>
          {soloPerPayment > 0 && (
            <p className={styles.modalHint}>
              <strong>{t('tontine.soloPerPayment', { amount: soloPerPayment.toLocaleString('fr-FR'), currency: cur })}</strong>
              {' · '}
              {t('tontine.soloTotalLine', { amount: (soloPerPayment * soloRounds).toLocaleString('fr-FR'), currency: cur, n: soloRounds })}
            </p>
          )}
        </>
      ) : (
        <div className={styles.modalRow}>
          <div className="form-group">
            <label className="label" htmlFor="t-amount">{t('tontine.contributionLabel')}</label>
            <input id="t-amount" type="number" inputMode="numeric" className="input" placeholder="25 000"
              min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="t-members">{t('tontine.membersLabel')}</label>
            <input id="t-members" type="number" inputMode="numeric" className="input" placeholder="10"
              min={2} max={50} value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} />
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="label">{t('tontine.frequency')}</label>
        <div className={styles.segRow}>
          {freqs.map((f) => (
            <button key={f} type="button"
              className={`${styles.segBtn} ${frequency === f ? styles.segBtnActive : ''}`}
              onClick={() => setFrequency(f)}>
              {t(`freq.${f}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="t-start">{t('tontine.startDate')}</label>
        <input id="t-start" type="date" className="input" min={today}
          value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </div>

      {!isSolo && (
        <div className="form-group">
          <label className="label" htmlFor="t-desc">
            {distribution === 'project' ? t('tontine.projectGoal') : t('tontine.descOptional')}
          </label>
          <input id="t-desc" className="input"
            placeholder={distribution === 'project' ? t('tontine.projectGoalPlaceholder') : t('tontine.descPlaceholder')}
            maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      )}

      <p className={styles.modalHint}>
        {distribution === 'rotating'
          ? t('tontine.hintRotating', { n: maxMembers || 'N' })
          : distribution === 'project'
            ? t('tontine.hintProject')
            : distribution === 'solo'
              ? t('tontine.hintSolo', { n: soloRounds || plannedRounds || 'N' })
              : t('tontine.hintGrowth', { n: maxMembers || 'N' })}
        {' '}{isSolo ? t('tontine.hintSuffixSolo') : t('tontine.hintSuffix')}
      </p>

      {isSolo && purchaseItem.trim() && (
        <p className={styles.modalHint}>
          🔒 {t('tontine.soloEscrowNote', { item: purchaseItem.trim() })}
        </p>
      )}

      {error && <div className={styles.modalError}>⚠️ {error}</div>}

      <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
        {loading
          ? t('tontine.creating')
          : isSolo
            ? t('tontine.createSubmitSolo')
            : t('tontine.createSubmit', { label: meta.label })}
      </button>
    </form>
  );
}
