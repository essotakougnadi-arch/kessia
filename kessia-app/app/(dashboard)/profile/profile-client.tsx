'use client';
// ============================================================
// KESSIA — Profil (Client Component)
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './profile.module.css';
import { KessiaMobileIcon } from '@/components/design-system/ui/KessiaLogo';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { Modal } from '@/components/ui/Modal';
import { useUiStore } from '@/store/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, useKyc } from '@/hooks/useProfile';
import { useWallet } from '@/hooks/useWallet';
import { useTontines } from '@/hooks/useTontines';
import { formatNumber, initials } from '@/lib/utils/format';
import { useLocaleStore, useT } from '@/lib/i18n';
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n/config';
import { useThemeStore, type ThemeChoice } from '@/store/themeStore';
import { useAccentStore, ACCENT_CHOICES, type AccentChoice } from '@/store/accentStore';
import { useUserTypeMeta } from '@/lib/user/user-type-i18n';
import type { KycStatus, UserType } from '@prisma/client';

function scoreRatingKey(score: number): string {
  if (score >= 800) return 'profile.score.excellent';
  if (score >= 700) return 'profile.score.veryGood';
  if (score >= 600) return 'profile.score.good';
  if (score >= 400) return 'profile.score.fair';
  if (score > 0) return 'profile.score.toImprove';
  return 'profile.score.notCalculated';
}

type MenuAction = 'locale' | 'theme' | 'accent' | 'usertype';
const MENU_ITEMS: { icon: string; labelKey: string; href: string; ready: boolean; action?: MenuAction }[] = [
  { icon: '🧭', labelKey: 'profile.menu.usertype', href: '', ready: true, action: 'usertype' },
  { icon: '🛡️', labelKey: 'profile.menu.kyc', href: '/profile/kyc', ready: true },
  { icon: '🌍', labelKey: 'profile.menu.locale', href: '', ready: true, action: 'locale' },
  { icon: '🎨', labelKey: 'profile.menu.theme', href: '', ready: true, action: 'theme' },
  { icon: '🖌️', labelKey: 'profile.menu.accent', href: '', ready: true, action: 'accent' },
  { icon: '🔒', labelKey: 'profile.menu.security', href: '/profile/security', ready: true },
  { icon: '🛡️', labelKey: 'profile.menu.privacy', href: '/profile/privacy', ready: true },
  { icon: '⚖️', labelKey: 'profile.menu.trust', href: '/trust', ready: true },
  { icon: '💬', labelKey: 'profile.menu.support', href: '/support', ready: true },
  { icon: '🔔', labelKey: 'profile.menu.notifications', href: '/profile/notifications', ready: true },
];

export default function ProfileClient() {
  const t = useT();
  const userTypeI18n = useUserTypeMeta();
  const router = useRouter();
  const addToast = useUiStore((s) => s.addToast);
  const { logout } = useAuth();
  const { locale, setLocale } = useLocaleStore();
  const { theme, setTheme } = useThemeStore();
  const { accent, setAccent } = useAccentStore();
  const [localeModal, setLocaleModal] = useState(false);
  const [themeModal, setThemeModal] = useState(false);
  const [accentModal, setAccentModal] = useState(false);
  const [typeModal, setTypeModal] = useState(false);

  const { profile, isLoading, error, refresh, updateProfile } = useProfile();
  const { kyc } = useKyc();
  const { stats } = useWallet();
  const { tontines } = useTontines();

  const score = profile?.profile.kessiaScore ?? 0;
  const R = 34;
  const CIRC = 2 * Math.PI * R;
  const dashOffset = CIRC * (1 - Math.min(1, score / 1000));

  const kycStatus = kyc?.kycStatus ?? profile?.kycStatus ?? 'NOT_STARTED';
  const activeTontines = tontines.filter((tn) => tn.status === 'ACTIVE' || tn.status === 'PENDING').length;
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric' })
    : '—';
  const kycLabel = (s: KycStatus) => t(`kyc.status.${s}`);

  const userType = (profile?.profile.userType ?? 'INDIVIDUAL') as UserType;

  function goTo(item: { href: string; ready: boolean; action?: MenuAction }) {
    if (item.action === 'locale') { setLocaleModal(true); return; }
    if (item.action === 'theme') { setThemeModal(true); return; }
    if (item.action === 'accent') { setAccentModal(true); return; }
    if (item.action === 'usertype') { setTypeModal(true); return; }
    if (item.ready) router.push(item.href);
    else addToast({ type: 'info', message: t('profile.sectionSoon') });
  }

  async function chooseType(nextType: UserType) {
    setTypeModal(false);
    const r = await updateProfile({ userType: nextType });
    addToast({
      type: r.success ? 'success' : 'error',
      message: r.success ? t('profile.typeSetToast', { label: userTypeI18n.get(nextType).label }) : r.message,
    });
    if (r.success) refresh();
  }

  function chooseLocale(l: Locale) {
    setLocale(l);
    setLocaleModal(false);
    addToast({
      type: LOCALE_META[l].ready ? 'success' : 'info',
      message: LOCALE_META[l].ready
        ? t('profile.localeSetToast', { lang: LOCALE_META[l].native })
        : t('profile.localePartialToast', { lang: LOCALE_META[l].native }),
    });
    if (l === 'fr' || l === 'en') void updateProfile({ language: l });
  }

  return (
    <div className={styles.page}>

      {/* ═══ HERO ═══ */}
      <div className={styles.profileHero}>
        <div className={styles.heroGlow1} /><div className={styles.heroGlow2} />

        <div className={styles.avatarWrapper}>
          <div className={styles.avatarRing}>
            <div className={styles.avatar}>{initials(profile?.firstName, profile?.lastName)}</div>
          </div>
          <button
            className={styles.avatarEdit}
            id="btn-edit-avatar"
            aria-label={t('profile.editPhoto')}
            onClick={() => addToast({ type: 'info', message: t('profile.photoSoon') })}
          >
            📷
          </button>
        </div>

        <div className={styles.profileName}>
          {profile ? `${profile.firstName} ${profile.lastName}` : '…'}
        </div>
        <div className={styles.profilePhone}>{profile?.phone ?? ''}</div>

        <div className={styles.profileBadges}>
          {profile?.role && profile.role !== 'USER' && (
            <span className={styles.badgeGold}>🏆 {profile.role}</span>
          )}
          {kycStatus === 'VERIFIED' && <span className={styles.badgeGold}>{t('profile.badgeKycVerified')}</span>}
          {profile?.isActive && <span className={styles.badgeGreen}>{t('profile.badgeActive')}</span>}
        </div>
      </div>

      {error && !isLoading && (
        <ErrorNote message={t('profile.loadError')} onRetry={refresh} />
      )}

      {/* ═══ KESSIA SCORE ═══ */}
      <section className={styles.scoreSection} id="score">
        <Link href="/profile/score" className={styles.scoreCard} style={{ textDecoration: 'none' }}>
          <div className={styles.scoreLeft}>
            <svg viewBox="0 0 80 80" width="80" height="80">
              <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(182,90,58,0.12)" strokeWidth="7" />
              <circle
                cx="40" cy="40" r={R} fill="none" stroke="#B65A3A" strokeWidth="7"
                strokeDasharray={CIRC.toFixed(1)} strokeDashoffset={dashOffset.toFixed(1)}
                strokeLinecap="round" transform="rotate(-90 40 40)"
              />
              <text x="40" y="44" textAnchor="middle" fill="#B65A3A" fontSize="18" fontWeight="900">{score}</text>
            </svg>
          </div>
          <div className={styles.scoreRight}>
            <div className={styles.scoreTitle}>KESSIA Score</div>
            <div className={styles.scoreRating}>{t(scoreRatingKey(score))}</div>
            <div className={styles.scoreDesc}>
              {t('profile.scoreCardHint')}
            </div>
          </div>
        </Link>
      </section>

      {/* ═══ KYC BANNER ═══ */}
      <section className={styles.section}>
        <Link href="/profile/kyc" className={styles.kycBanner} id="btn-kyc">
          <div className={styles.kycBannerLeft}>
            <div className={styles.kycIcon}>🛡️</div>
            <div>
              <div className={styles.kycTitle}>
                {kycStatus === 'VERIFIED' ? t('profile.kycVerifiedTitle') : t('profile.kycTitle', { status: kycLabel(kycStatus) })}
              </div>
              <div className={styles.kycSub}>
                {kycStatus === 'VERIFIED'
                  ? t('profile.kycVerifiedSub', { level: profile?.kycLevel ?? kyc?.kycLevel ?? 1 })
                  : t('profile.kycCompleteSub')}
              </div>
              <div className={styles.kycProgress}>
                <div
                  className={styles.kycProgressBar}
                  style={{ width: `${kycStatus === 'VERIFIED' ? 100 : kycStatus === 'NOT_STARTED' ? 5 : 55}%` }}
                />
              </div>
              <div className={styles.kycProgressText}>
                {kyc?.activeCase ? t('profile.docsSubmitted', { count: kyc.activeCase.documents.length }) : t('profile.noDocs')}
              </div>
            </div>
          </div>
          <span className={styles.kycArrow}>→</span>
        </Link>
      </section>

      {/* ═══ STATS ═══ */}
      <section className={styles.section}>
        <div className={styles.statsGrid}>
          {[
            { label: t('profile.statActiveTontines'), value: String(activeTontines), icon: '🔄' },
            { label: t('wallet.transactions'), value: String(stats?.totalTransactions ?? 0), icon: '📊' },
            { label: 'KESSIA Score', value: formatNumber(score), icon: '⭐' },
            { label: t('profile.statMemberSince'), value: memberSince, icon: '📅' },
          ].map((s) => (
            <div key={s.label} className={styles.statCard}>
              <div className={styles.statIcon}>{s.icon}</div>
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ AI BANNER ═══ */}
      <section className={styles.section}>
        <Link href="/ai" className={styles.aiBanner} id="btn-profile-ai">
          <div className={styles.aiIcon}><KessiaMobileIcon size={42} /></div>
          <div>
            <div className={styles.aiTitle}>{t('profile.aiGreeting', { name: profile?.firstName ?? '' })}</div>
            <div className={styles.aiSub}>{t('profile.aiSub')}</div>
          </div>
          <span className={styles.aiArrow}>→</span>
        </Link>
      </section>

      {/* ═══ MENU ═══ */}
      <section className={styles.section}>
        <div className={styles.menuCard}>
          {MENU_ITEMS.map((item, i) => (
            <button
              key={item.labelKey}
              className={styles.menuItem}
              id={`btn-profile-${i}`}
              onClick={() => goTo(item)}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', font: 'inherit', cursor: 'pointer' }}
            >
              <div className={styles.menuIcon}>{item.icon}</div>
              <span className={styles.menuLabel}>{t(item.labelKey)}</span>
              {item.action === 'locale' && (
                <span className={`${styles.menuBadge} ${styles.menuBadge_warning}`}>{LOCALE_META[locale].native}</span>
              )}
              {item.action === 'theme' && (
                <span className={`${styles.menuBadge} ${styles.menuBadge_warning}`}>{t(`profile.theme.${theme}`)}</span>
              )}
              {item.action === 'accent' && (
                <span className={`${styles.menuBadge} ${styles.menuBadge_warning}`}>{t(`profile.accent.${accent}`)}</span>
              )}
              {item.action === 'usertype' && (
                <span className={`${styles.menuBadge} ${styles.menuBadge_warning}`}>{userTypeI18n.get(userType).label}</span>
              )}
              {item.labelKey === 'profile.menu.kyc' && kycStatus !== 'VERIFIED' && (
                <span className={`${styles.menuBadge} ${styles.menuBadge_warning}`}>{kycLabel(kycStatus)}</span>
              )}
              <span className={styles.menuArrow}>›</span>
            </button>
          ))}
        </div>
      </section>

      {/* ═══ DÉCONNEXION ═══ */}
      <section className={styles.section}>
        <button className={styles.logoutBtn} id="btn-logout" onClick={() => logout()}>
          🚪 {t('profile.logout')}
        </button>
        <p className={styles.versionText}>KESSIA v1.0.0-beta · Togo 🇹🇬</p>
      </section>

      <Modal open={typeModal} onClose={() => setTypeModal(false)} title={t('profile.menu.usertype')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', margin: '0 0 4px' }}>
            {t('profile.typeModalHint')}
          </p>
          {userTypeI18n.mvpList.map((m) => (
            <button
              key={m.key}
              onClick={() => chooseType(m.key)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${m.key === userType ? 'var(--color-primary)' : 'var(--color-border-medium)'}`,
                background: m.key === userType ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                font: 'inherit', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 18 }}>{m.icon}</span>
              <span style={{ flex: 1 }}>
                <strong style={{ display: 'block', fontSize: 14 }}>{m.label}</strong>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{m.hint}</span>
              </span>
              {m.key === userType && <span style={{ color: 'var(--color-primary)', fontWeight: 800 }}>✓</span>}
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={localeModal} onClose={() => setLocaleModal(false)} title={t('profile.menu.locale')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => chooseLocale(l)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${l === locale ? 'var(--color-primary)' : 'var(--color-border-medium)'}`,
                background: l === locale ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                font: 'inherit', textAlign: 'left',
              }}
            >
              <span>
                <strong>{LOCALE_META[l].native}</strong>
                {!LOCALE_META[l].ready && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{t('profile.partial')}</span>}
              </span>
              {l === locale && <span style={{ color: 'var(--color-primary)', fontWeight: 800 }}>✓</span>}
            </button>
          ))}
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {t('profile.currencyNote')}
          </p>
        </div>
      </Modal>

      <Modal open={themeModal} onClose={() => setThemeModal(false)} title={t('profile.menu.theme')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['system', 'light', 'dark'] as ThemeChoice[]).map((tc) => (
            <button
              key={tc}
              onClick={() => { setTheme(tc); setThemeModal(false); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: 12, cursor: 'pointer', font: 'inherit', textAlign: 'left',
                border: `1.5px solid ${tc === theme ? 'var(--color-primary)' : 'var(--color-border-medium)'}`,
                background: tc === theme ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
              }}
            >
              <span>{tc === 'system' ? '🖥️' : tc === 'light' ? '☀️' : '🌙'} <strong>{t(`profile.theme.${tc}`)}</strong>
                {tc === 'system' && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{t('profile.themeSystemHint')}</span>}
              </span>
              {tc === theme && <span style={{ color: 'var(--color-primary)', fontWeight: 800 }}>✓</span>}
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={accentModal} onClose={() => setAccentModal(false)} title={t('profile.menu.accent')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ACCENT_CHOICES.map((ac) => {
            const swatch = ac === 'brique' ? '#C84B1E' : '#B65A3A';
            return (
              <button
                key={ac}
                onClick={() => { setAccent(ac as AccentChoice); setAccentModal(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '12px 14px', borderRadius: 12, cursor: 'pointer', font: 'inherit', textAlign: 'left',
                  border: `1.5px solid ${ac === accent ? 'var(--color-primary)' : 'var(--color-border-medium)'}`,
                  background: ac === accent ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span aria-hidden style={{ width: 22, height: 22, borderRadius: 7, background: swatch, flex: 'none', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)' }} />
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong>{t(`profile.accent.${ac}`)}</strong>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{t(`profile.accentHint.${ac}`)}</span>
                  </span>
                </span>
                {ac === accent && <span style={{ color: 'var(--color-primary)', fontWeight: 800 }}>✓</span>}
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
