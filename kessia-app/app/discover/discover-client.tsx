'use client';
// ============================================================
// KESSIA — Page publique « Tontines ouvertes » (/discover)
// Accessible sans compte. Rejoindre exige une inscription /
// connexion (le clic mène à /register?next=...).
// ============================================================

import Link from 'next/link';
import { KessiaLogo } from '@/components/design-system/ui/KessiaLogo';
import { DiscoveryRail } from '@/components/discover/DiscoveryRail';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/lib/i18n';
import styles from './discover.module.css';

export default function DiscoverClient() {
  const t = useT();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={isAuthenticated ? '/home' : '/'} className={styles.logo} aria-label="KESSIA">
          <KessiaLogo size={30} variant="full" />
        </Link>
        <div className={styles.headerRight}>
          <LanguageSwitcher />
          {isAuthenticated ? (
            <Link href="/home" className="btn btn-ghost btn-sm">{t('nav.home')}</Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">{t('landing.login')}</Link>
              <Link href="/register" className="btn btn-primary btn-sm">{t('landing.start')}</Link>
            </>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>{t('discover.pageTitle')}</h1>
        <p className={styles.sub}>{t('discover.pageSub')}</p>

        <DiscoveryRail
          context="page"
          layout="grid"
          limit={48}
          showHeader={false}
          emptyText={t('discover.empty')}
        />

        {!isAuthenticated && (
          <div className={styles.cta}>
            <p>{t('discover.pageCta')}</p>
            <Link href="/register" className="btn btn-primary btn-lg">{t('landing.start')}</Link>
          </div>
        )}
      </main>
    </div>
  );
}
