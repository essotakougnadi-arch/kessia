// ============================================================
// KESSIA — Simulateur d'activité (cahier des charges §20, §8, §23)
//
// Projette le chiffre d'affaires, la marge et le résultat d'une
// activité sur un horizon, à partir d'un taux de croissance mensuel
// visé. PUR et déterministe. Sert d'appui au Growth Plan (§23).
//
// Ce sont des PROJECTIONS, pas des garanties : la croissance visée
// est une hypothèse fournie par l'utilisateur.
// ============================================================

export type BusinessSimInput = {
  /** chiffre d'affaires du mois en cours (FCFA) */
  monthlyRevenue: number;
  /** croissance mensuelle visée, en % (ex. 5 = +5 %/mois) */
  monthlyGrowthPct: number;
  /** taux de marge brute, en % */
  marginRatePct: number;
  /** charges fixes mensuelles (FCFA) */
  monthlyExpenses: number;
  /** horizon en mois (1 à 24) */
  months: number;
};

export type BusinessSimPoint = {
  month: number;
  revenue: number;
  grossMargin: number;
  profit: number;
  cumulativeProfit: number;
};

export type BusinessSimResult = {
  points: BusinessSimPoint[];
  startRevenue: number;
  endRevenue: number;
  totalRevenue: number;
  totalProfit: number;
  /** premier mois où le résultat mensuel devient positif (1-indexé), null sinon */
  breakEvenMonth: number | null;
  /** CA mensuel nécessaire pour couvrir les charges à la marge donnée */
  breakEvenRevenue: number;
};

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n || 0)));
}
function clampNum(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n || 0));
}

export function projectBusiness(input: BusinessSimInput): BusinessSimResult {
  const startRevenue = Math.max(0, Math.round(input.monthlyRevenue || 0));
  const g = clampNum(input.monthlyGrowthPct, -50, 50) / 100;
  const margin = clampNum(input.marginRatePct, 0, 100) / 100;
  const expenses = Math.max(0, Math.round(input.monthlyExpenses || 0));
  const months = clampInt(input.months, 1, 24);

  const points: BusinessSimPoint[] = [];
  let revenue = startRevenue;
  let cumulativeProfit = 0;
  let breakEvenMonth: number | null = null;

  for (let m = 1; m <= months; m++) {
    if (m > 1) revenue = revenue * (1 + g);
    const grossMargin = revenue * margin;
    const profit = grossMargin - expenses;
    cumulativeProfit += profit;
    if (breakEvenMonth === null && profit >= 0) breakEvenMonth = m;
    points.push({
      month: m,
      revenue: Math.round(revenue),
      grossMargin: Math.round(grossMargin),
      profit: Math.round(profit),
      cumulativeProfit: Math.round(cumulativeProfit),
    });
  }

  return {
    points,
    startRevenue,
    endRevenue: points[points.length - 1]?.revenue ?? startRevenue,
    totalRevenue: points.reduce((s, p) => s + p.revenue, 0),
    totalProfit: Math.round(cumulativeProfit),
    breakEvenMonth,
    breakEvenRevenue: margin > 0 ? Math.round(expenses / margin) : 0,
  };
}
