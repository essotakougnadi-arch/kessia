'use client';
// ============================================================
// KESSIA — Onboarding (carrousel de bienvenue, MVP §4)
// 4 diapositives, "Passer" à tout moment, mémorise la complétion.
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './onboarding.module.css';
import { KessiaMobileIcon } from '@/components/design-system/ui/KessiaLogo';
import { useT } from '@/lib/i18n';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

const SLIDES = [
  { art: '🤝', key: 's1' },
  { art: '🔄', key: 's2' },
  { art: '💰', key: 's3' },
  { art: '✨', key: 's4' },
] as const;

export default function OnboardingClient() {
  const router = useRouter();
  const t = useT();
  const [i, setI] = useState(0);

  // Le carrousel s'affiche à chaque visite : « Suivant » guide le nouvel
  // utilisateur jusqu'à l'inscription. « Passer » / « J'ai déjà un compte »
  // servent de sortie rapide.
  function done(to: string) {
    router.push(to);
  }

  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  return (
    <div className={styles.page}>
      <div className={styles.top} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <LanguageSwitcher />
        <button className={styles.skip} onClick={() => done('/register')}>{t('auth.onboarding.skip')}</button>
      </div>

      <div className={styles.slide} key={i}>
        {i === 0 ? (
          <div className={styles.art}><KessiaMobileIcon size={104} /></div>
        ) : (
          <div className={styles.art} aria-hidden>{slide.art}</div>
        )}
        <h1 className={styles.title}>{t(`auth.onboarding.slides.${slide.key}.title`)}</h1>
        <p className={styles.desc}>{t(`auth.onboarding.slides.${slide.key}.desc`)}</p>
      </div>

      <div className={styles.dots}>
        {SLIDES.map((_, idx) => (
          <span key={idx} className={`${styles.dot} ${idx === i ? styles.dotActive : ''}`} />
        ))}
      </div>

      <div className={styles.actions}>
        {last ? (
          <button className="btn btn-primary btn-lg btn-full" onClick={() => done('/register')}>
            {t('auth.onboarding.createAccount')}
          </button>
        ) : (
          <button className="btn btn-primary btn-lg btn-full" onClick={() => setI(i + 1)}>
            {t('auth.onboarding.next')}
          </button>
        )}
        <p className={styles.footNote}>
          {t('auth.onboarding.haveAccount')}{' '}
          <Link href="/login">{t('auth.onboarding.signIn')}</Link>
        </p>
      </div>
    </div>
  );
}
