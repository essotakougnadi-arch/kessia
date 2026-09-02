// ============================================================
// KESSIA — i18n serveur (§38)
// Lit la locale choisie par l'utilisateur (cookie `kessia-locale`,
// posé côté client par le store Zustand `persist`) et fournit un
// traducteur pour la prose générée côté serveur : KESSIA Score,
// ADN d'entreprise, plan de croissance, opportunités, insights…
//
// Utilisable uniquement dans un contexte de requête App Router
// (route handler, server component, server action). Hors requête
// (tests, scripts), retombe silencieusement sur le français.
// ============================================================

import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_META, isLocale, type Locale } from './config';
import { makeTranslate, type Translate } from './core';

const COOKIE = 'kessia-locale';

/** Locale de la requête courante (défaut FR si indisponible). */
export function getServerLocale(): Locale {
  try {
    const raw = cookies().get(COOKIE)?.value;
    return isLocale(raw) ? raw : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Traducteur lié à la locale de la requête. */
export function serverT(): Translate {
  return makeTranslate(getServerLocale());
}

/** Formatage d'un entier selon la locale de la requête (« 12 500 » / « 12,500 »). */
export function serverNumber(n: number): string {
  const intl = LOCALE_META[getServerLocale()].intl;
  return new Intl.NumberFormat(intl, { maximumFractionDigits: 0 }).format(Math.round(n));
}

export type { Translate };
