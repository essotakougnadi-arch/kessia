'use client';
// ============================================================
// KESSIA — Provider i18n léger (§38)
// - locale persistée (localStorage) + synchronisée avec le profil
// - fallback automatique vers le Français (clé absente → FR → clé)
// - interpolation `{var}` : t('home.greeting', { name: 'Ama' })
// - pilote aussi la locale de formatage (Intl) — voir lib/utils/format
// ============================================================

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LOCALE, LOCALE_META, isLocale, type Locale } from './config';
import { setFormatLocale, setFormatMessages, type FormatMessages } from '@/lib/utils/format';
import type { TontineFrequency, TransactionType } from '@prisma/client';
import { CATALOGS, resolve, interpolate, type Vars } from './core';
import { fr } from './messages/fr';

// Écrit la locale dans un cookie (accessible au serveur — voir lib/i18n/server.ts)
function syncLocaleCookie(locale: Locale) {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `kessia-locale=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* environnements sans document.cookie */
  }
}

type LocaleState = {
  locale: Locale;
  setLocale: (l: Locale) => void;
};

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => {
        syncLocaleCookie(locale);
        set({ locale });
      },
    }),
    { name: 'kessia-locale' }
  )
);

const FREQ_KEYS: TontineFrequency[] = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'];
const TX_KEYS: TransactionType[] = [
  'DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'TONTINE_CONTRIBUTION',
  'TONTINE_PAYOUT', 'SALE_PAYMENT', 'FEE', 'REVERSAL', 'REFUND',
];

// Construit le dictionnaire poussé vers les helpers purs de lib/utils/format.
function buildFormatMessages(t: TFunction): FormatMessages {
  const freq = Object.fromEntries(
    FREQ_KEYS.map((k) => [k, t(`format.freq.${k}`)])
  ) as FormatMessages['freq'];
  const tx = Object.fromEntries([
    ...TX_KEYS.map((k) => [k, t(`format.tx.${k}`)]),
    ['fallback', t('format.tx.fallback')],
  ]) as FormatMessages['tx'];
  return {
    justNow: t('format.justNow'),
    minutesAgo: t('format.minutesAgo'),
    today: t('format.today'),
    yesterday: t('format.yesterday'),
    freq,
    tx,
  };
}

export type TFunction = (
  key: string,
  varsOrFallback?: Vars | string,
  fallback?: string
) => string;

const identityT: TFunction = (k, vof, fb) =>
  interpolate(typeof vof === 'string' ? vof : fb ?? k, typeof vof === 'object' ? vof : undefined);

const I18nContext = createContext<{ locale: Locale; t: TFunction }>({
  locale: DEFAULT_LOCALE,
  t: identityT,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const storeLocale = useLocaleStore((s) => s.locale);
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  // évite le mismatch d'hydratation : on applique la locale persistée après le montage
  useEffect(() => {
    const next = isLocale(storeLocale) ? storeLocale : DEFAULT_LOCALE;
    setLocale(next);
    syncLocaleCookie(next); // rattrape le cas « localStorage rempli, cookie absent »
  }, [storeLocale]);

  const value = useMemo(() => {
    const primary = CATALOGS[locale];
    const t: TFunction = (key, varsOrFallback, fallback) => {
      const vars = typeof varsOrFallback === 'object' ? varsOrFallback : undefined;
      const fb = typeof varsOrFallback === 'string' ? varsOrFallback : fallback;
      const raw = resolve(primary, key) ?? resolve(fr, key) ?? fb ?? key;
      return interpolate(raw, vars);
    };
    return { locale, t };
  }, [locale]);

  useEffect(() => {
    setFormatLocale(LOCALE_META[locale].intl);
    setFormatMessages(buildFormatMessages(value.t));
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  }, [locale, value]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `const t = useT(); t('nav.home')` — ou `t('key', { count: 3 })` */
export function useT(): TFunction {
  return useContext(I18nContext).t;
}

export function useLocale() {
  return useContext(I18nContext).locale;
}
