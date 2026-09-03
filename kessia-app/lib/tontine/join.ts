// ============================================================
// KESSIA — Règles de candidature à une tontine (découverte, §6)
// Logique pure, testable. La demande est toujours validée
// manuellement par le gestionnaire (accepte / refuse).
// ============================================================

import type { JoinRequestStatus, MemberStatus, TontineStatus } from '@prisma/client';

export interface JoinabilityInput {
  isPublic: boolean;
  status: TontineStatus;
  memberCount: number;
  maxMembers: number;
  isCreator: boolean;
  /** statut du membre existant s'il y en a un */
  memberStatus?: MemberStatus | null;
  /** statut de la demande d'adhésion existante s'il y en a une */
  requestStatus?: JoinRequestStatus | null;
}

export type JoinabilityCode =
  | 'CAN_REQUEST'
  | 'ALREADY_MEMBER'
  | 'IS_CREATOR'
  | 'REQUEST_PENDING'
  | 'REQUEST_APPROVED'
  | 'REMOVED'
  | 'NOT_PUBLIC'
  | 'NOT_OPEN'
  | 'FULL';

export interface Joinability {
  code: JoinabilityCode;
  /** true seulement si l'utilisateur peut envoyer (ou renvoyer) une demande */
  canRequest: boolean;
}

/** Détermine si un utilisateur peut demander à rejoindre une tontine publique. */
export function describeJoinability(i: JoinabilityInput): Joinability {
  if (i.isCreator) return { code: 'IS_CREATOR', canRequest: false };

  if (i.memberStatus === 'ACTIVE' || i.memberStatus === 'INVITED') {
    return { code: 'ALREADY_MEMBER', canRequest: false };
  }
  if (i.memberStatus === 'SUSPENDED' || i.memberStatus === 'REMOVED') {
    return { code: 'REMOVED', canRequest: false };
  }

  if (i.requestStatus === 'PENDING') return { code: 'REQUEST_PENDING', canRequest: false };
  if (i.requestStatus === 'APPROVED') return { code: 'REQUEST_APPROVED', canRequest: false };

  if (!i.isPublic) return { code: 'NOT_PUBLIC', canRequest: false };
  if (i.status !== 'PENDING') return { code: 'NOT_OPEN', canRequest: false };
  if (i.memberCount >= i.maxMembers) return { code: 'FULL', canRequest: false };

  // requestStatus REJECTED / CANCELLED / null → peut (re)demander
  return { code: 'CAN_REQUEST', canRequest: true };
}
