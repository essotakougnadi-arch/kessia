// ============================================================
// KESSIA — Internationalisation (cahier des charges §38)
// MVP : Français. Architecture prête pour English, Ewe, etc.
// Monnaie initiale XOF ; architecture multi-devise.
// ============================================================

export const LOCALES = ['fr', 'en', 'ee'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'fr';

export const LOCALE_META: Record<Locale, { label: string; native: string; ready: boolean; intl: string }> = {
  fr: { label: 'Français', native: 'Français', ready: true, intl: 'fr-FR' },
  en: { label: 'Anglais', native: 'English', ready: false, intl: 'en-GB' },
  ee: { label: 'Éwé', native: 'Eʋegbe', ready: false, intl: 'fr-FR' },
};

export const DEFAULT_CURRENCY = 'XOF';

export function isLocale(v: string | null | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
