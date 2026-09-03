'use client';
// ============================================================
// KESSIA — Accueil (Client Component)
// Solde, tontines et activités branchés sur l'API
// ============================================================

import Link from 'next/link';
import styles from './home.module.css';
import { KessiaMobileIcon } from '@/components/design-system/ui/KessiaLogo';
import { DiscoveryRail } from '@/components/discover/DiscoveryRail';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import { useWallet } from '@/hooks/useWallet';
import { useTontines } from '@/hooks/useTontines';
import { useInsights } from '@/hooks/useInsights';
import { useScore } from '@/hooks/useScore';
import { useProfile } from '@/hooks/useProfile';
import { useGrowth } from '@/hooks/useGrowth';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useUserTypeMeta } from '@/lib/user/user-type-i18n';
import { tontineTypeMeta } from '@/lib/tontine/type-meta';
import {
  describeTransaction,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeDate,
  formatSignedAmount,
  initials,
} from '@/lib/utils/format';

type Service = { id: string; icon: string; labelKey: string; href: string; bg: string; focus?: 'wallet' | 'tontine' | 'business' };

const SERVICES: Service[] = [
  { id: 'wallet', icon: '💰', labelKey: 'nav.wallet', href: '/wallet', bg: '#FEF0E8', focus: 'wallet' },
  { id: 'tontines', icon: '🔄', labelKey: 'nav.tontines', href: '/tontine', bg: '#E8F5F0', focus: 'tontine' },
  { id: 'business', icon: '🏪', labelKey: 'nav.business', href: '/business', bg: '#FDF6E8', focus: 'business' },
  { id: 'ai', icon: '✨', labelKey: 'nav.aiLabel', href: '/ai', bg: '#E8F5F0' },
  { id: 'score', icon: '📊', labelKey: 'home.svcScore', href: '/profile/score', bg: '#FEF0E8' },
  { id: 'growth', icon: '🌱', labelKey: 'home.svcGrowth', href: '/growth', bg: '#E8F5F0' },
  { id: 'calendar', icon: '🗓️', labelKey: 'home.svcCalendar', href: '/calendar', bg: '#FEF0E8' },
  { id: 'simulator', icon: '🧮', labelKey: 'home.svcSimulate', href: '/simulator', bg: '#F1ECFA' },
  { id: 'explore', icon: '🧭', labelKey: 'nav.explore', href: '/explore', bg: '#F5F4F2' },
];

/** Ordonne la grille de services selon le profil déclaré (§4). */
function orderServices(focus: readonly ('wallet' | 'tontine' | 'business')[]): Service[] {
  const rank = (s: Service) => {
    const i = s.focus ? focus.indexOf(s.focus) : -1;
    return i === -1 ? 99 : i;
  };
  return [...SERVICES].sort((a, b) => rank(a) - rank(b));
}

export default function HomeClient() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const isBalanceVisible = useUiStore((s) => s.isBalanceVisible);
  const toggleBalance = useUiStore((s) => s.toggleBalance);

  const { wallet, stats, transactions, isLoading: walletLoading, error: walletError, refresh: refreshWallet } = useWallet();
  const { tontines, isLoading: tontinesLoading } = useTontines();
  const { insights } = useInsights();
  const { score: kessiaScore } = useScore();
  const { profile } = useProfile();
  const { plan: growthPlan } = useGrowth();
  const { opportunities } = useOpportunities();

  const meta = useUserTypeMeta().get(profile?.profile.userType ?? 'INDIVIDUAL');
  const services = orderServices(meta.focus);
  const growthNext = (growthPlan?.steps ?? []).filter((s) => s.status === 'DOING' || s.status === 'TODO').slice(0, 2);

  const firstName = user?.firstName ?? '';
  const currency = wallet?.currency ?? 'XOF';
  const monthlyNet = stats ? stats.monthlyIn - stats.monthlyOut : 0;
  const recent = transactions.slice(0, 4);
  const activeTontines = tontines.filter((t) => t.status === 'ACTIVE' || t.status === 'PENDING');

  const hideMask = '••••••';

  const INSIGHT_TONE: Record<string, string> = {
    warn: 'var(--color-danger)', action: 'var(--color-primary)',
    tip: 'var(--color-text-secondary)', celebrate: 'var(--color-success)',
  };

  return (
    <div className={styles.page}>

      {/* ═══ HEADER ═══ */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div>
            <div className={styles.greeting}>
              {t('home.greeting')}{firstName ? `, ${firstName}` : ''} 👋
            </div>
            <div className={styles.greetingSub}>{t('home.greetingSub')}</div>
          </div>
          <div className={styles.headerRight}>
            <Link href="/notifications" className={styles.notifBtn} id="btn-home-notif">
              🔔
              <span className={styles.notifDot} />
            </Link>
            <Link href="/profile" className={styles.avatarLink} id="btn-home-profile">
              <div className={styles.avatar}>{initials(user?.firstName, user?.lastName)}</div>
            </Link>
          </div>
        </div>
      </header>

      {walletError && !walletLoading && (
        <ErrorNote message={t('home.balanceError')} onRetry={refreshWallet} />
      )}

      {/* ═══ BALANCE CARD ═══ */}
      <section className={styles.balanceSection}>
        <div className={styles.balanceCard}>
          <div className={styles.cardGlow1} /><div className={styles.cardGlow2} />

          <div className={styles.balanceInner}>
            <div className={styles.balanceLabelRow}>
              <span className={styles.balanceLabel}>{t('home.totalBalance')}</span>
              <button
                className={styles.eyeBtn}
                id="btn-toggle-balance"
                onClick={toggleBalance}
                aria-label={isBalanceVisible ? t('home.hideBalance') : t('home.showBalance')}
              >
                {isBalanceVisible ? '👁' : '🙈'}
              </button>
            </div>
            <div className={styles.balanceAmountRow}>
              <span className={`${styles.balanceAmount} ${walletLoading ? styles.skeleton : ''}`}>
                {walletLoading
                  ? '000 000'
                  : isBalanceVisible
                    ? formatNumber(wallet?.balance ?? 0)
                    : hideMask}
              </span>
              <span className={styles.balanceCurrency}>
                {currency === 'XOF' || currency === 'XAF' ? 'FCFA' : currency}
              </span>
            </div>
            {!walletLoading && stats && (
              <div className={styles.balanceChange}>
                <span className={styles.changeArrow}>{monthlyNet >= 0 ? '↑' : '↓'}</span>
                {monthlyNet >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(monthlyNet), currency)} {t('home.thisMonth')}
              </div>
            )}
          </div>

          <div className={styles.cardActions}>
            <Link href="/wallet?action=send" className={styles.cardAction} id="btn-envoyer">
              <div className={styles.cardActionIcon}>➡️</div>
              <span>{t('wallet.send')}</span>
            </Link>
            <Link href="/wallet?action=receive" className={styles.cardAction} id="btn-recevoir">
              <div className={styles.cardActionIcon}>⬇️</div>
              <span>{t('wallet.receive')}</span>
            </Link>
            <Link href="/wallet?action=deposit" className={styles.cardAction} id="btn-recharger">
              <div className={styles.cardActionIcon}>⬆️</div>
              <span>{t('wallet.topUp')}</span>
            </Link>
            <Link href="/tontine" className={styles.cardAction} id="btn-tontine-quick">
              <div className={styles.cardActionIcon}>🔄</div>
              <span>{t('nav.tontines')}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ POUR VOUS — Smart Alerts (§5, §7) ═══ */}
      {insights.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('home.forYou')}</h2>
            <Link href="/ai" className={styles.seeAll} id="btn-all-insights">{t('nav.aiLabel')}</Link>
          </div>
          <div className={styles.activityCard}>
            {insights.map((it) => {
              const inner = (
                <>
                  <div className={styles.activityIcon}>{it.icon}</div>
                  <div className={styles.activityInfo}>
                    <div className={styles.activityTitle}>{it.title}</div>
                    <div className={styles.activitySub}>{it.body}</div>
                  </div>
                  {it.actionUrl && (
                    <span className={styles.activityAmount} style={{ color: INSIGHT_TONE[it.kind] }}>→</span>
                  )}
                </>
              );
              return it.actionUrl ? (
                <Link key={it.id} href={it.actionUrl} className={styles.activityItem} id={`insight-${it.id}`}>
                  {inner}
                </Link>
              ) : (
                <div key={it.id} className={styles.activityItem}>{inner}</div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ PREMIERS PAS — parcours adapté au profil (§4) ═══ */}
      {meta.firstSteps.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('home.firstSteps')} · {meta.label}</h2>
          </div>
          <div className={styles.activityCard}>
            {meta.firstSteps.map((step, i) => (
              <Link key={step.href + i} href={step.href} className={styles.activityItem} id={`firststep-${i}`}>
                <div className={styles.activityIcon}>{['1️⃣', '2️⃣', '3️⃣', '4️⃣'][i] ?? '•'}</div>
                <div className={styles.activityInfo}>
                  <div className={styles.activityTitle}>{step.label}</div>
                </div>
                <span className={styles.activityAmount} style={{ color: 'var(--color-primary)' }}>→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ═══ SERVICES RAPIDES ═══ */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('home.quickActions')}</h2>
        </div>
        <div className={styles.servicesGrid}>
          {services.map((svc) => (
            <Link key={svc.id} href={svc.href} className={styles.serviceItem} id={`btn-svc-${svc.id}`}>
              <div className={styles.serviceIcon} style={{ background: svc.bg }}>
                <span>{svc.icon}</span>
              </div>
              <span className={styles.serviceLabel}>{t(svc.labelKey)}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ═══ KESSIA SCORE ═══ */}
      {kessiaScore && (
        <section className={styles.section}>
          <Link href="/profile/score" className={styles.scoreBanner} id="btn-score">
            <div className={styles.scoreBannerLeft}>
              <div className={styles.scoreGaugeWrap}>
                <svg viewBox="0 0 52 52" width="52" height="52">
                  <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4"/>
                  <circle cx="26" cy="26" r="22" fill="none" stroke="#D6A84F" strokeWidth="4"
                    strokeDasharray="138.2" strokeDashoffset={(138.2 * (1 - kessiaScore.score / 1000)).toFixed(1)} strokeLinecap="round"
                    transform="rotate(-90 26 26)"/>
                  <text x="26" y="30" textAnchor="middle" fill="white" fontSize="12" fontWeight="900">{kessiaScore.score}</text>
                </svg>
              </div>
              <div>
                <div className={styles.scoreTitle}>KESSIA Score</div>
                <div className={styles.scoreRating}>{kessiaScore.bandLabel}</div>
              </div>
            </div>
            <div className={styles.scoreBannerRight}>
              <div className={styles.scoreDesc}>
                {kessiaScore.advice[0] ?? t('home.scoreDefaultAdvice')}
              </div>
              <div className={styles.scoreLink}>{t('home.seeDetail')}</div>
            </div>
          </Link>
        </section>
      )}

      {/* ═══ PLAN DE CROISSANCE (§23) ═══ */}
      {growthPlan && growthNext.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('home.growthPlan')}</h2>
            <Link href="/growth" className={styles.seeAll} id="btn-all-growth">
              {growthPlan.summary.completionPct}% · {t('common.seeAll')}
            </Link>
          </div>
          <div className={styles.activityCard}>
            {growthNext.map((step) => (
              <Link key={step.key} href={step.actionUrl} className={styles.activityItem} id={`growth-${step.key}`}>
                <div className={styles.activityIcon}>{step.status === 'DOING' ? '⏳' : '🌱'}</div>
                <div className={styles.activityInfo}>
                  <div className={styles.activityTitle}>{step.title}</div>
                  <div className={styles.activitySub}>{step.metricLabel} : {step.targetHint}</div>
                </div>
                <span className={styles.activityAmount} style={{ color: 'var(--color-primary)' }}>→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ═══ OPPORTUNITÉS (§17) ═══ */}
      {opportunities.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('home.opportunities')}</h2>
            <Link href="/ai" className={styles.seeAll} id="btn-all-opportunities">{t('nav.aiLabel')}</Link>
          </div>
          <div className={styles.activityCard}>
            {opportunities.slice(0, 3).map((op) => (
              <Link key={op.id} href={op.actionUrl} className={styles.activityItem} id={`opp-${op.id}`}>
                <div className={styles.activityIcon}>{op.icon}</div>
                <div className={styles.activityInfo}>
                  <div className={styles.activityTitle}>{op.title}</div>
                  <div className={styles.activitySub}>{op.rationale}</div>
                </div>
                {op.potential != null && (
                  <span className={styles.activityAmount} style={{ color: 'var(--color-success)' }}>
                    {formatNumber(op.potential)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ═══ TONTINES ACTIVES ═══ */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('home.myTontines')}</h2>
          <Link href="/tontine" className={styles.seeAll} id="btn-all-tontines">{t('common.seeAll')}</Link>
        </div>
        <div className={styles.tontineList}>
          {tontinesLoading && (
            <div className={styles.tontineCard}>
              <div className={styles.tontineCardLeft}>
                <div className={styles.tontineIcon}>🔄</div>
                <div className={styles.tontineInfo}>
                  <div className={`${styles.tontiName} ${styles.skeleton} ${styles.skeletonDark}`}>{t('common.loading')}</div>
                  <div className={`${styles.tontiMeta} ${styles.skeleton} ${styles.skeletonDark}`}>— {t('home.members')}</div>
                </div>
              </div>
            </div>
          )}

          {!tontinesLoading && activeTontines.length === 0 && (
            <div className={styles.emptyRow}>{t('home.noTontines')}</div>
          )}

          {!tontinesLoading && activeTontines.slice(0, 3).map((tn) => {
            const pct = tn.totalRounds > 0 ? Math.round((tn.currentRound / tn.totalRounds) * 100) : 0;
            const pot = tn.amount * tn.memberCount;
            return (
              <Link key={tn.id} href={`/tontine/${tn.id}`} className={styles.tontineCard} id={`btn-tontine-${tn.id}`}>
                <div className={styles.tontineCardLeft}>
                  <div className={styles.tontineIcon}>{tontineTypeMeta(tn.type).icon}</div>
                  <div className={styles.tontineInfo}>
                    <div className={styles.tontiName}>{tn.name}</div>
                    <div className={styles.tontiMeta}>
                      {tn.memberCount} {tn.memberCount > 1 ? t('home.members') : t('home.member')} · {t(`freq.${tn.frequency}`)}
                    </div>
                    <div className={styles.tontiProgressBar}>
                      <div className={styles.tontiProgress} style={{ width: `${pct}%` }} />
                    </div>
                    <div className={styles.tontiProgressText}>
                      {t('home.round', { current: tn.currentRound, total: tn.totalRounds })}
                      {tn.nextContributionDate ? ` — ${t('home.nextDue', { date: formatDate(tn.nextContributionDate) })}` : ''}
                    </div>
                  </div>
                </div>
                <div className={styles.tontineCardRight}>
                  <div className={styles.tontiAmount}>{formatNumber(pot)}</div>
                  <div className={styles.tontiCurrency}>
                    {tn.currency === 'XOF' || tn.currency === 'XAF' ? 'FCFA' : tn.currency}
                  </div>
                  <div className={styles.tontiLabel}>{t('home.pot')}</div>
                </div>
              </Link>
            );
          })}

          <Link href="/tontine?create=1" className={styles.createTontine} id="btn-create-tontine">
            <span className={styles.createTontinePlus}>+</span>
            {t('home.createTontine')}
          </Link>
        </div>
      </section>

      {/* ═══ TONTINES OUVERTES — découverte ═══ */}
      <section className={styles.section}>
        <DiscoveryRail context="home" limit={10} />
      </section>

      {/* ═══ ACTIVITÉS RÉCENTES ═══ */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('home.recentActivity')}</h2>
          <Link href="/wallet" className={styles.seeAll} id="btn-all-tx">{t('common.seeAll')}</Link>
        </div>
        <div className={styles.activityCard}>
          {walletLoading && (
            [0, 1, 2].map((i) => (
              <div key={i} className={styles.activityItem}>
                <div className={styles.activityIcon}>💰</div>
                <div className={styles.activityInfo}>
                  <div className={`${styles.activityTitle} ${styles.skeleton} ${styles.skeletonDark}`}>{t('common.loading')}</div>
                  <div className={`${styles.activitySub} ${styles.skeleton} ${styles.skeletonDark}`}>·</div>
                </div>
              </div>
            ))
          )}

          {!walletLoading && recent.length === 0 && (
            <div className={styles.emptyRow}>{t('home.noTransactions')}</div>
          )}

          {!walletLoading && recent.map((tx) => {
            const { icon, label } = describeTransaction(tx.type, tx.description);
            return (
              <div key={tx.id} className={styles.activityItem}>
                <div className={styles.activityIcon}>{icon}</div>
                <div className={styles.activityInfo}>
                  <div className={styles.activityTitle}>{label}</div>
                  <div className={styles.activitySub}>{formatRelativeDate(tx.createdAt)}</div>
                </div>
                <div
                  className={`${styles.activityAmount} ${tx.direction === 'CREDIT' ? styles.credit : styles.debit}`}
                >
                  {formatSignedAmount(tx.amount, tx.direction)}{' '}
                  <span className={styles.fcfa}>
                    {tx.currency === 'XOF' || tx.currency === 'XAF' ? 'FCFA' : tx.currency}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ AI BANNER ═══ */}
      <section className={styles.section}>
        <Link href="/ai" className={styles.aiBanner} id="btn-ai-home">
          <div className={styles.aiBannerIcon}>
            <KessiaMobileIcon size={44} />
          </div>
          <div className={styles.aiBannerText}>
            <div className={styles.aiBannerTitle}>KESSIA AI</div>
            <div className={styles.aiBannerSub}>{t('home.aiBannerSub')}</div>
          </div>
          <span className={styles.aiBannerArrow}>→</span>
        </Link>
      </section>

    </div>
  );
}
