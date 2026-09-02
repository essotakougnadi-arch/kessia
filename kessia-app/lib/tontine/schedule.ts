// ============================================================
// KESSIA — Calcul des échéances de tontine (pur, sans I/O)
// ============================================================

import type { TontineFrequency } from '@prisma/client';

/** Ajoute un intervalle de fréquence à une date (gestion correcte des mois). */
export function addFrequency(from: Date, frequency: TontineFrequency): Date {
  const d = new Date(from);
  if (frequency === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (frequency === 'BIWEEKLY') d.setDate(d.getDate() + 14);
  else d.setMonth(d.getMonth() + 1); // MONTHLY
  return d;
}

/** Ajoute `n` intervalles de fréquence. */
export function addFrequencyN(from: Date, frequency: TontineFrequency, n: number): Date {
  let d = new Date(from);
  for (let i = 0; i < n; i++) d = addFrequency(d, frequency);
  return d;
}
