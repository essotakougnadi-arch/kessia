// ============================================================
// KESSIA — Journal d'événements de tontine (§6.4, §42)
// Non bloquant : un échec d'écriture ne casse jamais l'action métier.
// ============================================================

import prisma from '@/lib/db/prisma';
import type { TontineEventType } from '@prisma/client';

export type TontineEventInput = {
  tontineId: string;
  type: TontineEventType;
  actorId?: string | null;
  round?: number | null;
  amount?: number | null;
  metadata?: Record<string, unknown>;
};

export async function recordTontineEvent(input: TontineEventInput): Promise<void> {
  try {
    await prisma.tontineEvent.create({
      data: {
        tontineId: input.tontineId,
        type: input.type,
        actorId: input.actorId ?? undefined,
        round: input.round ?? undefined,
        amount: input.amount ?? undefined,
        metadata: (input.metadata ?? undefined) as never,
      },
    });
  } catch (e) {
    console.error('[TONTINE_EVENT] échec écriture', input.type, e);
  }
}

const LABELS: Record<TontineEventType, string> = {
  CREATED: 'Tontine créée',
  MEMBER_JOINED: 'Nouveau membre',
  MEMBER_LEFT: 'Départ d’un membre',
  ACTIVATED: 'Tontine démarrée',
  AGREEMENT_ACCEPTED: 'Contrat accepté',
  CONTRIBUTION_PAID: 'Cotisation réglée',
  CONTRIBUTION_LATE: 'Cotisation en retard',
  PAYOUT: 'Versement de la cagnotte',
  ROUND_ADVANCED: 'Passage au tour suivant',
  COMPLETED: 'Cycle terminé',
  GUARANTEE_CLAIM: 'Demande au Fonds de Garantie',
  ESCROW_SHORTFALL: 'Séquestre insuffisant',
};

export function tontineEventLabel(type: TontineEventType): string {
  return LABELS[type] ?? type;
}
