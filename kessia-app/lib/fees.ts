// ============================================================
// KESSIA — Grille tarifaire (cahier des charges §21, §53)
// Source unique. « Aucun frais caché » — tout est listé ici et
// affiché dans le Trust Center. Localisé via le catalogue i18n
// serveur (`srvFees.line.*`).
// ============================================================

import type { Translate } from '@/lib/i18n/core';

export type FeeLine = {
  key: string;
  label: string;
  fee: string;
  detail: string;
};

export const FEE_KEYS = [
  'signup', 'wallet', 'transfer', 'deposit', 'withdrawal', 'tontine', 'business', 'ai',
] as const;

/** Grille tarifaire localisée. */
export function feeLines(t: Translate): FeeLine[] {
  return FEE_KEYS.map((key) => ({
    key,
    label: t(`srvFees.line.${key}.label`),
    fee: t(`srvFees.line.${key}.fee`),
    detail: t(`srvFees.line.${key}.detail`),
  }));
}
