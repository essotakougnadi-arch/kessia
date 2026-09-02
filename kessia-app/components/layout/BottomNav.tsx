'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BottomNav.module.css';
import { useT } from '@/lib/i18n';

// Cahier des charges §37 : Accueil | Wallet | Tontines | Business | Profil
const NAV_ITEMS = [
  { href: '/home', icon: '🏠', key: 'nav.home' },
  { href: '/wallet', icon: '💰', key: 'nav.wallet' },
  { href: '/tontine', icon: '🔄', key: 'nav.tontines' },
  { href: '/business', icon: '🏪', key: 'nav.business' },
  { href: '/profile', icon: '👤', key: 'nav.profile' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <>
      {/* KESSIA AI — accessible globalement (§10 / §17) */}
      <Link href="/ai" className={styles.aiFab} id="btn-nav-ai" aria-label="KESSIA AI">
        <span aria-hidden>✨</span>
      </Link>

      <nav className={styles.nav} aria-label="Navigation mobile">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={t(item.key)}
            active={pathname.startsWith(item.href)}
          />
        ))}
      </nav>
    </>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`${styles.item} ${active ? styles.itemActive : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className={styles.itemIconWrapper}>
        <span className={styles.itemIcon}>{icon}</span>
        {active && <span className={styles.itemDot} />}
      </span>
      <span className={styles.itemLabel}>{label}</span>
    </Link>
  );
}
