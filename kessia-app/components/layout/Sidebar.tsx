'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';
import { KessiaLogo, KessiaMobileIcon } from '@/components/design-system/ui/KessiaLogo';
import { useT } from '@/lib/i18n';

const NAV_ITEMS = [
  { href: '/home',      icon: '🏠', key: 'nav.home'     },
  { href: '/wallet',    icon: '💰', key: 'nav.wallet'   },
  { href: '/tontine',   icon: '🔄', key: 'nav.tontines' },
  { href: '/business',  icon: '🏪', key: 'nav.business' },
  { href: '/explore',   icon: '🧭', key: 'nav.explore'  },
  { href: '/support',   icon: '💬', key: 'nav.support'  },
];

const BOTTOM_ITEMS = [
  { href: '/profile', icon: '👤', key: 'nav.myProfile' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const t = useT();

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
      <div className={styles.userQuick}>
        <div className={styles.avatar}>KA</div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>Kossi Abalo</div>
          <div className={styles.userKyc}>
            <span className={styles.kycDot} />
            KYC en cours
          </div>
        </div>
        <Link href="/notifications" className={styles.notifBtn} aria-label="Notifications">
          <span>🔔</span>
          <span className={styles.notifBadge}>3</span>
        </Link>
      </div>

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
                <div className={styles.navIcon}>{item.icon}</div>
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
              <div className={styles.navIcon}>{item.icon}</div>
              <span className={styles.navLabel}>{t(item.key)}</span>
            </Link>
          );
        })}
        <button className={`${styles.navItem} ${styles.logoutBtn}`} aria-label={t('nav.logout')}>
          <div className={styles.navIcon}>🚪</div>
          <span className={styles.navLabel}>{t('nav.logout')}</span>
        </button>
      </div>
    </aside>
  );
}
