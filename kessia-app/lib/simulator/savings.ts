// ============================================================
// KESSIA — Simulateur d'épargne / d'objectif (cahier des charges §20)
//
// Projection PURE et déterministe d'un plan d'épargne : versement
// récurrent + capital de départ, sur un horizon donné.
//
// RÈGLE CRITIQUE (MASTER PROMPT) : KESSIA ne promet aucun rendement.
// Ce simulateur ne calcule donc AUCUN intérêt — c'est une projection
// de ce qui est mis de côté, pas une promesse financière.
// ============================================================

export type SavingsFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

/** Nombre de versements par mois pour chaque fréquence (approché). */
const PER_MONTH: Record<SavingsFrequency, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  MONTHLY: 1,
};

export type SavingsInput = {
  /** capital déjà disponible au départ */
  initial: number;
  /** montant d'un versement */
  contribution: number;
  frequency: SavingsFrequency;
  /** horizon en mois (1 à 60) */
  months: number;
  /** objectif optionnel à atteindre */
  goalAmount?: number;
};

export type SavingsPoint = { month: number; contributed: number; balance: number };

export type SavingsProjection = {
  points: SavingsPoint[];
  totalContributed: number;
  finalBalance: number;
  monthlyEquivalent: number;
  goal: null | {
    amount: number;
    reached: boolean;
    /** mois où l'objectif est atteint (1-indexé), null si hors horizon */
    monthReached: number | null;
    /** montant restant à la fin de l'horizon si non atteint */
    shortfall: number;
    /** versement mensuel nécessaire pour atteindre l'objectif dans l'horizon */
    requiredMonthly: number;
  };
};

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function projectSavings(input: SavingsInput): SavingsProjection {
  const initial = Math.max(0, input.initial || 0);
  const contribution = Math.max(0, input.contribution || 0);
  const months = clampInt(input.months || 0, 1, 60);
  const perMonth = PER_MONTH[input.frequency] * contribution;

  const points: SavingsPoint[] = [];
  let contributed = 0;
  for (let m = 1; m <= months; m++) {
    contributed += perMonth;
    points.push({
      month: m,
      contributed: Math.round(contributed),
      balance: Math.round(initial + contributed),
    });
  }

  const totalContributed = Math.round(contributed);
  const finalBalance = Math.round(initial + contributed);

  let goal: SavingsProjection['goal'] = null;
  if (input.goalAmount && input.goalAmount > 0) {
    const amount = Math.round(input.goalAmount);
    const hit = points.find((p) => p.balance >= amount);
    const remaining = Math.max(0, amount - initial);
    goal = {
      amount,
      reached: finalBalance >= amount,
      monthReached: hit ? hit.month : null,
      shortfall: Math.max(0, amount - finalBalance),
      requiredMonthly: Math.ceil(remaining / months),
    };
  }

  return {
    points,
    totalContributed,
    finalBalance,
    monthlyEquivalent: Math.round(perMonth),
    goal,
  };
}
