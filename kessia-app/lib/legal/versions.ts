// ============================================================
// KESSIA — Versionnage des documents juridiques (cahier des charges §8, §59)
//
// Source unique. À chaque révision d'un document, incrémenter
// LEGAL_VERSION (format AAAA-MM-JJ) et la date affichée. Les
// utilisateurs ayant accepté une version antérieure sont alors
// invités à ré-accepter via `components/legal/LegalGate.tsx`.
// ============================================================

/** Version en vigueur des documents juridiques. */
export const LEGAL_VERSION = '2026-08-29';

/**
 * Vrai si la version acceptée par l'utilisateur correspond à la version
 * en vigueur. Une valeur absente (jamais accepté) est considérée périmée.
 */
export function isTermsUpToDate(acceptedVersion: string | null | undefined): boolean {
  return !!acceptedVersion && acceptedVersion === LEGAL_VERSION;
}

/** Libellé lisible de la date de révision. */
export const LEGAL_VERSION_LABEL = '29 août 2026';

export type LegalDocKey = 'terms' | 'privacy' | 'mentions';

export const LEGAL_DOCS: Record<LegalDocKey, { path: string; title: string }> = {
  terms: { path: '/legal/terms', title: 'Conditions générales d’utilisation' },
  privacy: { path: '/legal/privacy', title: 'Politique de confidentialité' },
  mentions: { path: '/legal/mentions', title: 'Mentions légales' },
};
