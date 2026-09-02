// ============================================================
// KESSIA — Fonds de Garantie Solidaire · règles (cahier des charges §6.5)
//
// ⚠️ MODE DÉMONSTRATION. Aucun mouvement de fonds réel. Le « solde »
// affiché est une projection calculée à partir de l'activité réelle
// des tontines. L'activation du fonds est soumise à une qualification
// juridique (assimilable à une garantie financière). Voir ADR 0010.
//
// Le contournement/activation n'est PAS pilotable ici : la variable
// GUARANTEE_FUND_USER_REQUESTS (env) autorise seulement l'affichage du
// formulaire de demande côté utilisateur, à des fins de démonstration.
// ============================================================

export const GUARANTEE_RULES = {
  /** Le fonds n'est jamais « ACTIVE » dans le MVP. */
  status: 'SIMULATION' as const,
  currency: 'XOF',
  /** Part projetée des cotisations de tontine affectée au fonds (points de base). 100 bps = 1 %. */
  allocationRateBps: 100,
  /** Éligibilité d'un membre à une demande. */
  eligibility: {
    kycVerified: true,
    minOnTimeContributions: 3,
    minMembershipDays: 30,
  },
  /** Plafonds. */
  limits: {
    /** Montant maximal par demande = une cotisation du tour concerné (calculé). */
    maxPerClaimIsOneContribution: true,
    maxApprovedClaimsPerYear: 2,
  },
  /** Décision. */
  governance: {
    humanReviewRequired: true,
    reviewerRoles: ['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE'] as const,
  },
} as const;

export const ALLOCATION_RATE = GUARANTEE_RULES.allocationRateBps / 10_000; // 0.01

/** Le formulaire de demande côté utilisateur est-il visible ? (démo uniquement) */
export function userRequestsEnabled(): boolean {
  return process.env.GUARANTEE_FUND_USER_REQUESTS === '1';
}
