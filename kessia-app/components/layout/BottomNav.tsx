'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './BottomNav.module.css';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useT } from '@/lib/i18n';

// Cahier des charges §37 : Accueil | Wallet | Tontines | Business | Profil
const NAV_ITEMS: { href: string; icon: IconName; key: string }[] = [
  { href: '/home', icon: 'home', key: 'nav.home' },
  { href: '/wallet', icon: 'wallet', key: 'nav.wallet' },
  { href: '/tontine', icon: 'tontines', key: 'nav.tontines' },
  { href: '/business', icon: 'business', key: 'nav.business' },
  { href: '/profile', icon: 'profile', key: 'nav.profile' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const t = useT();

  // Sur /ai lui-même, le bouton flottant n'a pas de sens et recouvre la
  // barre de saisie — on le masque.
  const showAiFab = !pathname.startsWith('/ai');

  return (
    <>
      {/* KESSIA AI — accessible globalement (§10 / §17) */}
      {showAiFab && (
        <Link href="/ai" className={styles.aiFab} id="btn-nav-ai" aria-label="KESSIA AI">
          <Icon name="ai" size={24} strokeWidth={2} />
        </Link>
      )}

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

function NavItem({ href, icon, label, active }: { href: string; icon: IconName; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`${styles.item} ${active ? styles.itemActive : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className={styles.itemIconWrapper}>
        <span className={styles.itemIcon}><Icon name={icon} size={22} strokeWidth={active ? 2.1 : 1.8} tinted /></span>
        {active && <span className={styles.itemDot} />}
      </span>
      <span className={styles.itemLabel}>{label}</span>
    </Link>
  );
}
