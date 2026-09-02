'use client';
// ============================================================
// KESSIA — Détail Tontine (Client Component)
// ============================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './tontine-detail.module.css';
import { Modal } from '@/components/ui/Modal';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useTontineDetail } from '@/hooks/useTontineDetail';
import { formatDate, formatNumber, initials, formatFrequency } from '@/lib/utils/format';
import { useTontineTypeMeta } from '@/lib/tontine/type-meta-i18n';
import { useT } from '@/lib/i18n';

function fcfa(currency: string) {
  return currency === 'XOF' || currency === 'XAF' ? 'FCFA' : currency;
}

export default function TontineDetailClient({ id }: { id: string }) {
  const t = useT();
  const userId = useAuthStore((s) => s.user?.id);
  const addToast = useUiStore((s) => s.addToast);
  const typeMeta = useTontineTypeMeta();
  const { tontine: td, isLoading, error, contribute, startTontine } = useTontineDetail(id);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [contributing, setContributing] = useState(false);
  const [contribError, setContribError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [starting, setStarting] = useState(false);

  const myMembership = useMemo(
    () => td?.members.find((m) => m.userId === userId) ?? null,
    [td, userId]
  );

  const round = Math.max(1, td?.currentRound ?? 1);
  const alreadyPaid = useMemo(
    () =>
      !!td &&
      !!myMembership &&
      td.contributions.some(
        (c) => c.memberId === myMembership.id && c.round === round && c.status === 'PAID'
      ),
    [td, myMembership, round]
  );

  if (isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/tontine" className={styles.backBtn} aria-label={t('tontineDetail.back')}>←</Link>
          <div>
            <h1 className={`${styles.headerTitle} ${styles.skeleton}`}>{t('tontineDetail.loading')}</h1>
          </div>
        </header>
        <div className={styles.stateWrap}>
          <div className={styles.stateIcon}>🔄</div>
          <div className={styles.stateDesc}>{t('tontineDetail.loadingTontine')}</div>
        </div>
      </div>
    );
  }

  if (error || !td) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/tontine" className={styles.backBtn} aria-label={t('tontineDetail.back')}>←</Link>
          <div><h1 className={styles.headerTitle}>{t('tontineDetail.fallbackTitle')}</h1></div>
        </header>
        <div className={styles.stateWrap}>
          <div className={styles.stateIcon}>🚫</div>
          <div className={styles.stateTitle}>{t('tontineDetail.inaccessibleTitle')}</div>
          <div className={styles.stateDesc}>
            {error?.message ?? t('tontineDetail.inaccessibleDesc')}
          </div>
          <Link href="/tontine" className={styles.stateLink}>{t('tontineDetail.backToMine')}</Link>
        </div>
      </div>
    );
  }

  const meta = typeMeta(td.type);
  const isSolo = td.type === 'PURCHASE' && td.purchaseMode === 'SOLO';
  // Solo : « cagnotte » = objectif (prix de l'article ou total des versements)
  const pot = isSolo
    ? (td.targetAmount ?? td.amount * td.totalRounds)
    : td.amount * td.memberCount;
  const pct = td.totalRounds > 0 ? Math.round((td.currentRound / td.totalRounds) * 100) : 0;
  const isMyTurn =
    td.status === 'ACTIVE' &&
    !isSolo &&
    myMembership?.orderPosition != null &&
    myMembership.orderPosition === td.currentRound;
  const canContribute = td.isMember && td.status === 'ACTIVE' && !alreadyPaid;
  const canStartSolo = isSolo && td.status === 'PENDING' && td.isCreator;
  const canStartGroup = !isSolo && td.status === 'PENDING' && td.isCreator && td.memberCount >= 2;

  const paidHistory = [...td.schedules]
    .filter((s) => s.isPaid)
    .sort((a, b) => b.round - a.round);

  function memberName(refId: string | null) {
    if (!refId) return t('tontineDetail.beneficiary');
    const m = td!.members.find((mm) => mm.userId === refId || mm.id === refId);
    return m ? `${m.user.firstName} ${m.user.lastName}` : t('tontineDetail.beneficiary');
  }

  async function handleContribute() {
    setContribError(null);
    setContributing(true);
    const result = await contribute(round);
    setContributing(false);
    if (result.success) {
      addToast({ type: 'success', message: result.message });
      setConfirmOpen(false);
    } else {
      setContribError(result.message);
    }
  }

  async function handleStart() {
    setStarting(true);
    const r = await startTontine();
    setStarting(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(td!.inviteCode);
      addToast({ type: 'success', message: t('tontineDetail.inviteCopied') });
    } catch {
      addToast({ type: 'info', message: t('tontineDetail.codeIs', { code: td!.inviteCode }) });
    }
  }

  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <Link href="/tontine" className={styles.backBtn} aria-label={t('tontineDetail.back')}>←</Link>
        <div>
          <h1 className={styles.headerTitle}>{td.name}</h1>
          <div className={styles.headerStatus}>
            <span className={styles.statusDot} />
            {meta.icon}{' '}
            {t('tontineDetail.typeLine', {
              label: meta.label,
              status: t(`tontineDetail.status.${td.status}`),
              frequency: formatFrequency(td.frequency),
            })}
          </div>
        </div>
        {!isSolo && (
          <button
            className={styles.menuBtn}
            aria-label={t('tontineDetail.shareCodeAria')}
            id="btn-tontine-menu"
            onClick={() => setShowInvite((v) => !v)}
          >
            ⋮
          </button>
        )}
      </header>

      {!isSolo && showInvite && (
        <div className={styles.inviteBox}>
          <span className={styles.inviteCode}>{td.inviteCode}</span>
          <button className={styles.inviteCopy} onClick={copyInvite}>{t('tontineDetail.copy')}</button>
        </div>
      )}

      {/* Carte principale */}
      <section className={styles.mainCard}>
        <div className={styles.cardGlow} />

        <div className={styles.cardTop}>
          <div>
            <div className={styles.cardLabel}>
              {isSolo ? t('tontineDetail.soloGoalLabel') : t('tontineDetail.potPerRound')}
            </div>
            <div className={styles.cardAmount}>
              {formatNumber(pot)} <span className={styles.cardCurrency}>{fcfa(td.currency)}</span>
            </div>
            {isSolo && td.purchaseItem && (
              <div className={styles.cardLabel} style={{ marginTop: 2 }}>{td.purchaseItem}</div>
            )}
          </div>
          <div className={styles.cardStats}>
            <div className={styles.cardStat}>
              <span className={styles.cardStatVal}>{isSolo ? td.totalRounds : td.memberCount}</span>
              <span className={styles.cardStatLab}>
                {isSolo ? t('tontineDetail.soloPaymentsLab') : t('tontineDetail.members')}
              </span>
            </div>
            <div className={styles.cardStatDiv} />
            <div className={styles.cardStat}>
              <span className={styles.cardStatVal}>{formatNumber(td.amount)}</span>
              <span className={styles.cardStatLab}>
                {isSolo
                  ? t('tontineDetail.soloPerPaymentLab', { cur: fcfa(td.currency) })
                  : t('tontineDetail.stakeWithCur', { cur: fcfa(td.currency) })}
              </span>
            </div>
            <div className={styles.cardStatDiv} />
            <div className={styles.cardStat}>
              <span className={styles.cardStatVal}>{td.currentRound}/{td.totalRounds}</span>
              <span className={styles.cardStatLab}>{t('tontineDetail.round')}</span>
            </div>
          </div>
        </div>

        <div className={styles.progressSection}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.progressMeta}>
            <span>{t('tontineDetail.pctComplete', { pct })}</span>
            <span>
              {td.nextContributionDate
                ? t('tontineDetail.nextOn', { date: formatDate(td.nextContributionDate) })
                : t('tontineDetail.notStarted')}
            </span>
          </div>
          {td.escrow && (td.status === 'ACTIVE' || td.status === 'COMPLETED') && (
            <div className={styles.progressMeta} style={{ marginTop: 4 }}>
              <span title={isSolo ? t('tontineDetail.soloEscrowTitle') : t('tontineDetail.escrowTitle')}>
                {isSolo
                  ? t('tontineDetail.soloEscrowLine', { amount: formatNumber(td.escrow.held), cur: fcfa(td.currency) })
                  : t('tontineDetail.escrowLine', { amount: formatNumber(td.escrow.held), cur: fcfa(td.currency) })}
              </span>
            </div>
          )}
        </div>

        {isSolo && td.status === 'COMPLETED' ? (
          <div className={styles.myTurnAlert}>
            <span>🛒</span>
            <span>{t('tontineDetail.soloDoneLine', {
              amount: formatNumber(pot),
              cur: fcfa(td.currency),
              item: td.purchaseItem ?? '',
            })}</span>
          </div>
        ) : isSolo ? null : isMyTurn ? (
          <div className={styles.myTurnAlert}>
            <span>🎉</span>
            <span>{t('tontineDetail.myTurn')}</span>
          </div>
        ) : myMembership?.orderPosition != null ? (
          <div className={styles.myTurnInfo}>
            <span>⏳</span>
            <span>{t('tontineDetail.myPosition', { pos: myMembership.orderPosition })}</span>
          </div>
        ) : null}
      </section>

      {/* Démarrage — plan d'achat individuel */}
      {canStartSolo && (
        <section className={styles.section}>
          <div className={styles.myTurnInfo} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <span>🔒 {t('tontineDetail.soloPending')}</span>
            <button
              className="btn btn-primary btn-full"
              id="btn-start-tontine"
              disabled={starting}
              onClick={handleStart}
            >
              {starting ? t('tontineDetail.starting') : t('tontineDetail.soloStart')}
            </button>
          </div>
        </section>
      )}

      {/* Démarrage (créateur, tontine de groupe en attente) */}
      {!isSolo && td.status === 'PENDING' && td.isCreator && (
        <section className={styles.section}>
          <div className={styles.myTurnInfo} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <span>
              ⏳ {t('tontineDetail.pendingMembers', { n: td.memberCount, max: td.maxMembers })}
              {td.memberCount >= 2 ? t('tontineDetail.canStartNow') : t('tontineDetail.needTwoMembers')}
            </span>
            <button
              className="btn btn-primary btn-full"
              id="btn-start-tontine"
              disabled={starting || !canStartGroup}
              onClick={handleStart}
            >
              {starting ? t('tontineDetail.starting') : t('tontineDetail.startTontine')}
            </button>
          </div>
        </section>
      )}

      {!isSolo && td.status === 'PENDING' && !td.isCreator && (
        <section className={styles.section}>
          <div className={styles.myTurnInfo}>
            <span>⏳</span>
            <span>{t('tontineDetail.waitingStart', { name: td.createdBy.firstName, n: td.memberCount, max: td.maxMembers })}</span>
          </div>
        </section>
      )}

      {/* Actions rapides */}
      <section className={styles.section}>
        <div className={styles.actionsRow}>
          <button
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            id="btn-pay-cotisation"
            disabled={!canContribute}
            onClick={() => { setContribError(null); setConfirmOpen(true); }}
          >
            <span>💳</span>{' '}
            {isSolo
              ? (alreadyPaid ? t('tontineDetail.soloContributePaid') : t('tontineDetail.soloContribute'))
              : (alreadyPaid ? t('tontineDetail.contributePaid') : t('tontineDetail.contributeNow'))}
          </button>
          {!isSolo && (
            <>
              <button className={styles.actionBtn} id="btn-invite-member" onClick={() => setShowInvite(true)}>
                <span>➕</span> {t('tontineDetail.invite')}
              </button>
              <button className={styles.actionBtn} id="btn-share-tontine" onClick={copyInvite}>
                <span>🔗</span> {t('tontineDetail.share')}
              </button>
            </>
          )}
        </div>
      </section>

      {/* Contrat numérique + Fonds de Garantie */}
      {td.isMember && (
        <section className={styles.section}>
          <div className={styles.actionsRow}>
            <Link href={`/tontine/${id}/contrat`} className={styles.actionBtn} id="btn-tontine-contract">
              <span>📄</span> {t('tontineDetail.contractJournal')}
            </Link>
            <Link href="/tontine/garantie" className={styles.actionBtn} id="btn-tontine-guarantee">
              <span>🛟</span> {t('tontineDetail.guaranteeFund')}
            </Link>
          </div>
        </section>
      )}

      {/* Membres */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('tontineDetail.membersCount', { n: td.memberCount })}</h2>
        </div>
        <div className={styles.membersList}>
          {td.members.map((m) => {
            const isMe = m.userId === userId;
            const paid = td.contributions.some(
              (c) => c.memberId === m.id && c.round === round && c.status === 'PAID'
            );
            return (
              <div key={m.id} className={`${styles.memberCard} ${isMe ? styles.memberCardMe : ''}`}>
                <div className={styles.memberAvatar}>{initials(m.user.firstName, m.user.lastName)}</div>
                <div className={styles.memberInfo}>
                  <div className={styles.memberName}>
                    {m.user.firstName} {m.user.lastName} {isMe && <span className={styles.meBadge}>{t('tontineDetail.you')}</span>}
                  </div>
                  <div className={styles.memberTurn}>
                    {m.orderPosition != null ? t('tontineDetail.turnNumber', { n: m.orderPosition }) : t('tontineDetail.positionTbd')}
                  </div>
                </div>
                <div className={`${styles.memberStatus} ${paid ? styles.memberPaid : styles.memberPending}`}>
                  {paid ? t('tontineDetail.paid') : t('tontineDetail.pendingShort')}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Historique des cycles (sans objet pour un plan individuel) */}
      {!isSolo && (
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('tontineDetail.cyclesHistory')}</h2>
        </div>
        <div className={styles.historyList}>
          {paidHistory.length === 0 && (
            <div className={styles.historyCard}>
              <div className={styles.historyIcon}>🔄</div>
              <div className={styles.historyInfo}>
                <div className={styles.historyTitle}>{t('tontineDetail.noCycles')}</div>
                <div className={styles.historySub}>{t('tontineDetail.historyAppears')}</div>
              </div>
            </div>
          )}
          {paidHistory.map((h) => (
            <div key={h.id} className={styles.historyCard}>
              <div className={styles.historyIcon}>🔄</div>
              <div className={styles.historyInfo}>
                <div className={styles.historyTitle}>{t('tontineDetail.cycleN', { n: h.round, name: memberName(h.recipientId) })}</div>
                <div className={styles.historySub}>
                  {h.paidAt ? formatDate(h.paidAt) : formatDate(h.dueDate)}
                </div>
              </div>
              <div className={styles.historyAmount}>
                {formatNumber(pot)} <span className={styles.fcfa}>{fcfa(td.currency)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* Comment fonctionne ce type */}
      <section className={styles.section}>
        <div className={styles.rulesCard}>
          <h3 className={styles.rulesTitle}>{meta.icon} {meta.label}</h3>
          <p className={styles.rulesText}>{meta.description}</p>
          <ol style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {meta.howItWorks.map((s, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>{s}</li>
            ))}
          </ol>
        </div>
      </section>

      {/* Règles */}
      {(td.rules || td.description) && (
        <section className={styles.section}>
          <div className={styles.rulesCard}>
            <h3 className={styles.rulesTitle}>{t('tontineDetail.groupRules')}</h3>
            <p className={styles.rulesText}>{td.rules || td.description}</p>
            <div className={styles.rulesMeta}>
              <span>{t('tontineDetail.startLabel', { date: formatDate(td.startDate) })}</span>
              <span>{t('tontineDetail.createdByLabel', { name: `${td.createdBy.firstName} ${td.createdBy.lastName}` })}</span>
            </div>
          </div>
        </section>
      )}

      {/* Modale confirmation cotisation / versement */}
      <Modal
        open={confirmOpen}
        onClose={() => !contributing && setConfirmOpen(false)}
        title={isSolo ? t('tontineDetail.soloConfirmTitle') : t('tontineDetail.confirmContribution')}
        locked={contributing}
      >
        <div className={styles.confirmBody}>
          <div className={styles.confirmAmount}>
            {formatNumber(td.amount)} {fcfa(td.currency)}
          </div>
          <div>
            <div className={styles.confirmRow}><span>{t('tontineDetail.fallbackTitle')}</span><span>{td.name}</span></div>
            <div className={styles.confirmRow}><span>{t('tontineDetail.round')}</span><span>#{round}</span></div>
            <div className={styles.confirmRow}><span>{t('tontineDetail.debitedFrom')}</span><span>{t('tontineDetail.yourWallet')}</span></div>
            {isSolo && (
              <div className={styles.confirmRow}>
                <span>🔒</span>
                <span>{t('tontineDetail.soloEscrowTitle')}</span>
              </div>
            )}
          </div>
          {contribError && <div className={styles.modalError}>⚠️ {contribError}</div>}
          <button
            className="btn btn-primary btn-lg btn-full"
            disabled={contributing}
            onClick={handleContribute}
          >
            {contributing
              ? t('tontineDetail.processing')
              : isSolo ? t('tontineDetail.soloPayNow') : t('tontineDetail.payContribution')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
