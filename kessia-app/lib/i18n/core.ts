// ============================================================
// KESSIA — i18n : cœur partagé client / serveur (§38)
// Aucune dépendance React : importable depuis un composant client
// (index.tsx) comme depuis du code serveur (server.ts, lib/*).
// ============================================================

import { DEFAULT_LOCALE, type Locale } from './config';
import { fr } from './messages/fr';
import { en } from './messages/en';
import { ee } from './messages/ee';

export const CATALOGS: Record<Locale, unknown> = { fr, en, ee };

export type Vars = Record<string, string | number>;

/** Résout une clé "a.b.c" dans un catalogue ; ne renvoie que des chaînes. */
export function resolve(catalog: unknown, path: string): string | undefined {
  const value = path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, catalog);
  return typeof value === 'string' ? value : undefined;
}

export function interpolate(str: string, vars?: Vars): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export type Translate = (key: string, vars?: Vars) => string;

/** Fabrique un traducteur pour une locale : locale → fr → clé. */
export function makeTranslate(locale: Locale): Translate {
  const primary = CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
  return (key, vars) => {
    const raw = resolve(primary, key) ?? resolve(fr, key) ?? key;
    return interpolate(raw, vars);
  };
}
