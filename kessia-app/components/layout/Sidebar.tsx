'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';
import { KessiaLogo, KessiaMobileIcon } from '@/components/design-system/ui/KessiaLogo';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAuthStore } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import { initials } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';

const NAV_ITEMS: { href: string; icon: IconName; key: string }[] = [
  { href: '/home',        icon: 'home',        key: 'nav.home'     },
  { href: '/wallet',      icon: 'wallet',      key: 'nav.wallet'   },
  { href: '/tontine',     icon: 'tontines',    key: 'nav.tontines' },
  { href: '/business',    icon: 'business',    key: 'nav.business' },
  { href: '/marketplace', icon: 'marketplace', key: 'nav.marketplace' },
  { href: '/explore',     icon: 'explore',     key: 'nav.explore'  },
  { href: '/support',     icon: 'support',     key: 'nav.support'  },
];

const BOTTOM_ITEMS: { href: string; icon: IconName; key: string }[] = [
  { href: '/profile', icon: 'profile', key: 'nav.myProfile' },
];

const KYC_LABEL: Record<string, string> = {
  NOT_STARTED: 'nav.kycNotStarted',
  IN_PROGRESS: 'nav.kycInProgress',
  UNDER_REVIEW: 'nav.kycInProgress',
  ACTION_REQUIRED: 'nav.kycInProgress',
  VERIFIED: 'nav.kycVerified',
  REJECTED: 'nav.kycNotStarted',
  EXPIRED: 'nav.kycNotStarted',
};

export default function Sidebar() {
  const pathname = usePathname();
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const { logout } = useAuth();

  const name = user ? `${user.firstName} ${user.lastName}`.trim() : 'KESSIA';
  const kycKey = KYC_LABEL[user?.kycStatus ?? 'NOT_STARTED'] ?? 'nav.kycNotStarted';

  return (
    <aside className={styles.sidebar} aria-label="Navigation principale">

      {/* ——— Logo Web officiel ——— */}
      <div className={styles.logo}>
        <Link href="/home" className={styles.logoLink} aria-label="KESSIA — Accueil">
          <KessiaLogo size={30} variant="full" />
        </Link>
        <span className={styles.logoTag}>Beta</span>
      </div>

      {/* ——— User Quick Info ——— */}
      <Link href="/profile" className={styles.userQuick}>
        <div className={styles.avatar}>{initials(user?.firstName, user?.lastName)}</div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{name}</div>
          <div className={styles.userKyc}>
            <span className={styles.kycDot} />
            {t(kycKey)}
          </div>
        </div>
        <span className={styles.notifBtn} aria-hidden>›</span>
      </Link>

      {/* ——— Main Navigation ——— */}
      <nav className={styles.nav}>
        <div className={styles.navSection}>
          <div className={styles.navSectionLabel}>{t('nav.section')}</div>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className={styles.navIcon}><Icon name={item.icon} size={18} /></div>
                <span className={styles.navLabel}>{t(item.key)}</span>
                {isActive && <div className={styles.navActivePip} />}
              </Link>
            );
          })}
        </div>

        {/* ——— AI Banner ——— */}
        <div className={styles.aiSection}>
          <Link href="/ai" className={styles.aiBtn} id="btn-sidebar-ai">
            <div className={styles.aiBtnIconWrapper}>
              <KessiaMobileIcon size={38} />
            </div>
            <div>
              <div className={styles.aiBtnLabel}>KESSIA AI</div>
              <div className={styles.aiBtnSub}>{t('nav.aiAsk')}</div>
            </div>
          </Link>
        </div>
      </nav>

      {/* ——— Bottom ——— */}
      <div className={styles.bottomNav}>
        {BOTTOM_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            >
              <div className={styles.navIcon}><Icon name={item.icon} size={18} /></div>
              <span className={styles.navLabel}>{t(item.key)}</span>
            </Link>
          );
        })}
        <button
          className={`${styles.navItem} ${styles.logoutBtn}`}
          aria-label={t('nav.logout')}
          onClick={() => logout()}
        >
          <div className={styles.navIcon}><Icon name="logout" size={18} /></div>
          <span className={styles.navLabel}>{t('nav.logout')}</span>
        </button>
      </div>
    </aside>
  );
}
