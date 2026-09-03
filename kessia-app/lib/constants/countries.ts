// ============================================================
// KESSIA — Indicatifs pays pour la saisie du numéro de téléphone
// Périmètre : UEMOA d'abord (Togo par défaut), puis reste de
// l'Afrique de l'Ouest / Centrale, puis diaspora.
// `min` / `max` = longueur du numéro national (hors indicatif),
// utilisée pour une validation indicative côté client seulement —
// la validation qui fait foi reste côté serveur (Zod + normalizePhone).
// ============================================================

export interface Country {
  iso: string;   // ISO 3166-1 alpha-2
  name: string;  // libellé français
  dial: string;  // indicatif sans le « + »
  flag: string;  // emoji drapeau
  example: string; // exemple de numéro national
  min: number;
  max: number;
}

// Ordre = ordre d'affichage dans le sélecteur.
export const COUNTRIES: Country[] = [
  // ── UEMOA ──────────────────────────────────────────────
  { iso: 'TG', name: 'Togo',            dial: '228', flag: '🇹🇬', example: '90 12 34 56', min: 8, max: 8 },
  { iso: 'BJ', name: 'Bénin',           dial: '229', flag: '🇧🇯', example: '90 12 34 56', min: 8, max: 10 },
  { iso: 'BF', name: 'Burkina Faso',    dial: '226', flag: '🇧🇫', example: '70 12 34 56', min: 8, max: 8 },
  { iso: 'CI', name: "Côte d'Ivoire",   dial: '225', flag: '🇨🇮', example: '01 23 45 67 89', min: 8, max: 10 },
  { iso: 'GW', name: 'Guinée-Bissau',   dial: '245', flag: '🇬🇼', example: '955 12 34 56', min: 7, max: 9 },
  { iso: 'ML', name: 'Mali',            dial: '223', flag: '🇲🇱', example: '65 01 23 45', min: 8, max: 8 },
  { iso: 'NE', name: 'Niger',           dial: '227', flag: '🇳🇪', example: '93 12 34 56', min: 8, max: 8 },
  { iso: 'SN', name: 'Sénégal',         dial: '221', flag: '🇸🇳', example: '70 123 45 67', min: 9, max: 9 },

  // ── Afrique de l'Ouest / Centrale ─────────────────────────
  { iso: 'GH', name: 'Ghana',           dial: '233', flag: '🇬🇭', example: '24 123 4567', min: 9, max: 9 },
  { iso: 'NG', name: 'Nigéria',         dial: '234', flag: '🇳🇬', example: '80 1234 5678', min: 7, max: 11 },
  { iso: 'GN', name: 'Guinée',          dial: '224', flag: '🇬🇳', example: '62 12 34 56', min: 8, max: 9 },
  { iso: 'CV', name: 'Cabo Verde',      dial: '238', flag: '🇨🇻', example: '991 12 34', min: 7, max: 7 },
  { iso: 'MR', name: 'Mauritanie',      dial: '222', flag: '🇲🇷', example: '22 12 34 56', min: 8, max: 8 },
  { iso: 'SL', name: 'Sierra Leone',    dial: '232', flag: '🇸🇱', example: '25 123456', min: 8, max: 8 },
  { iso: 'LR', name: 'Libéria',         dial: '231', flag: '🇱🇷', example: '77 012 3456', min: 7, max: 9 },
  { iso: 'CM', name: 'Cameroun',        dial: '237', flag: '🇨🇲', example: '6 71 23 45 67', min: 8, max: 9 },
  { iso: 'GA', name: 'Gabon',           dial: '241', flag: '🇬🇦', example: '06 03 12 34', min: 6, max: 8 },
  { iso: 'CG', name: 'Congo',           dial: '242', flag: '🇨🇬', example: '06 123 4567', min: 9, max: 9 },
  { iso: 'CD', name: 'RD Congo',        dial: '243', flag: '🇨🇩', example: '99 123 4567', min: 9, max: 9 },
  { iso: 'TD', name: 'Tchad',           dial: '235', flag: '🇹🇩', example: '63 12 34 56', min: 8, max: 8 },

  // ── Diaspora ─────────────────────────────────────────────
  { iso: 'FR', name: 'France',          dial: '33',  flag: '🇫🇷', example: '6 12 34 56 78', min: 9, max: 9 },
  { iso: 'BE', name: 'Belgique',        dial: '32',  flag: '🇧🇪', example: '470 12 34 56', min: 8, max: 9 },
  { iso: 'DE', name: 'Allemagne',       dial: '49',  flag: '🇩🇪', example: '151 23456789', min: 6, max: 11 },
  { iso: 'GB', name: 'Royaume-Uni',     dial: '44',  flag: '🇬🇧', example: '7400 123456', min: 9, max: 10 },
  { iso: 'CA', name: 'Canada',          dial: '1',   flag: '🇨🇦', example: '506 234 5678', min: 10, max: 10 },
  { iso: 'US', name: 'États-Unis',      dial: '1',   flag: '🇺🇸', example: '212 555 0123', min: 10, max: 10 },
];

export const DEFAULT_COUNTRY_ISO = 'TG';
const STORAGE_KEY = 'kessia-phone-country';

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));

export function findCountry(iso: string | null | undefined): Country {
  return (iso && BY_ISO.get(iso)) || BY_ISO.get(DEFAULT_COUNTRY_ISO)!;
}

/** Compose un numéro E.164 (`+228xxxxxxxx`) à partir d'un pays et d'une saisie nationale. */
export function toE164(iso: string, national: string): string {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  return `+${findCountry(iso).dial}${digits}`;
}

/** Longueur nationale dans une fourchette plausible pour ce pays ? (indicatif, non bloquant) */
export function isNationalLengthPlausible(iso: string, national: string): boolean {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return false;
  const c = findCountry(iso);
  return digits.length >= c.min && digits.length <= c.max;
}

/** Dernier pays choisi (localStorage), sinon Togo. SSR-safe. */
export function readStoredCountryIso(): string {
  if (typeof window === 'undefined') return DEFAULT_COUNTRY_ISO;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && BY_ISO.has(v)) return v;
  } catch {
    /* localStorage indisponible */
  }
  return DEFAULT_COUNTRY_ISO;
}

export function storeCountryIso(iso: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, iso);
  } catch {
    /* localStorage indisponible */
  }
}
