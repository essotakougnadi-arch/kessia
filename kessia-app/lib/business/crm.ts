// ============================================================
// KESSIA — CRM : segmentation & indicateurs client (§7)
// Pur. La segmentation est dérivée du comportement d'achat.
// ============================================================

export type CustomerSegment = 'PROSPECT' | 'NOUVEAU' | 'REGULIER' | 'FIDELE' | 'INACTIF';

export const SEGMENT_LABEL: Record<CustomerSegment, string> = {
  PROSPECT: 'Prospect',
  NOUVEAU: 'Nouveau',
  REGULIER: 'Régulier',
  FIDELE: 'Fidèle',
  INACTIF: 'Inactif',
};

const DAY = 86_400_000;

export function customerSegment(input: {
  type: 'PROSPECT' | 'CLIENT';
  orderCount: number;
  lastOrderAt: Date | null;
  now?: Date;
}): CustomerSegment {
  if (input.type === 'PROSPECT' || input.orderCount === 0) return 'PROSPECT';
  const now = (input.now ?? new Date()).getTime();
  const daysSince = input.lastOrderAt ? (now - input.lastOrderAt.getTime()) / DAY : Infinity;
  if (daysSince > 90) return 'INACTIF';
  if (input.orderCount >= 5) return 'FIDELE';
  if (input.orderCount >= 2) return 'REGULIER';
  return 'NOUVEAU';
}
