import { describe, it, expect } from 'vitest';
import { projectSavings } from './savings';
import { simulateTontine } from './tontine';
import { projectBusiness } from './business';

describe('projectSavings', () => {
  it('projette un versement mensuel sans intérêt', () => {
    const r = projectSavings({ initial: 10_000, contribution: 5_000, frequency: 'MONTHLY', months: 6 });
    expect(r.points).toHaveLength(6);
    expect(r.totalContributed).toBe(30_000);
    expect(r.finalBalance).toBe(40_000);
    expect(r.points[0].balance).toBe(15_000);
  });

  it('n\'ajoute jamais de rendement (le solde = initial + versé)', () => {
    const r = projectSavings({ initial: 0, contribution: 10_000, frequency: 'MONTHLY', months: 12 });
    expect(r.finalBalance).toBe(r.totalContributed);
  });

  it('évalue un objectif : atteint dans l\'horizon', () => {
    const r = projectSavings({ initial: 0, contribution: 25_000, frequency: 'MONTHLY', months: 12, goalAmount: 100_000 });
    expect(r.goal?.reached).toBe(true);
    expect(r.goal?.monthReached).toBe(4);
    expect(r.goal?.shortfall).toBe(0);
  });

  it('évalue un objectif : non atteint → versement requis', () => {
    const r = projectSavings({ initial: 0, contribution: 5_000, frequency: 'MONTHLY', months: 10, goalAmount: 200_000 });
    expect(r.goal?.reached).toBe(false);
    expect(r.goal?.requiredMonthly).toBe(20_000);
  });

  it('borne l\'horizon à 60 mois', () => {
    const r = projectSavings({ initial: 0, contribution: 1_000, frequency: 'MONTHLY', months: 999 });
    expect(r.points).toHaveLength(60);
  });
});

describe('simulateTontine', () => {
  it('tontine classique tournante : je reçois la cagnotte à ma position', () => {
    const r = simulateTontine({ type: 'CLASSIC_ROTATING', amount: 10_000, members: 5, frequency: 'MONTHLY', myPosition: 3 });
    expect(r.totalRounds).toBe(5);
    expect(r.potPerRound).toBe(50_000);
    expect(r.myPayoutRound).toBe(3);
    expect(r.myTotalPaid).toBe(50_000);
    expect(r.myTotalReceived).toBe(50_000);
    expect(r.rounds[2].iReceive).toBe(50_000);
  });

  it('tontine croissance : versement à chaque tour, restitution au dernier', () => {
    const r = simulateTontine({ type: 'GROWTH', amount: 20_000, members: 4, frequency: 'MONTHLY', myPosition: 2 });
    expect(r.myPayoutRound).toBe(4);
    expect(r.rounds[3].iReceive).toBe(80_000);
    expect(r.myTotalReceived).toBe(80_000);
    expect(r.myTotalPaid).toBe(80_000);
  });

  it('tontine projet : une seule collecte, organisateur (pos 1) reçoit tout', () => {
    const org = simulateTontine({ type: 'PROJECT', amount: 15_000, members: 6, frequency: 'BIWEEKLY', myPosition: 1 });
    expect(org.totalRounds).toBe(1);
    expect(org.myTotalReceived).toBe(90_000);
    const contributor = simulateTontine({ type: 'PROJECT', amount: 15_000, members: 6, frequency: 'BIWEEKLY', myPosition: 4 });
    expect(contributor.myTotalReceived).toBe(0);
    expect(contributor.myTotalPaid).toBe(15_000);
  });

  it('le net cumulé revient à zéro sur un cycle complet (rotating)', () => {
    const r = simulateTontine({ type: 'CLASSIC_ROTATING', amount: 10_000, members: 5, frequency: 'MONTHLY', myPosition: 1 });
    expect(r.rounds[r.rounds.length - 1].cumulativeNet).toBe(0);
  });
});

describe('projectBusiness', () => {
  it('projette une croissance mensuelle composée', () => {
    const r = projectBusiness({ monthlyRevenue: 100_000, monthlyGrowthPct: 10, marginRatePct: 30, monthlyExpenses: 20_000, months: 3 });
    expect(r.points[0].revenue).toBe(100_000);
    expect(r.points[1].revenue).toBe(110_000);
    expect(r.points[2].revenue).toBe(121_000);
  });

  it('calcule le seuil de rentabilité', () => {
    const r = projectBusiness({ monthlyRevenue: 50_000, monthlyGrowthPct: 0, marginRatePct: 25, monthlyExpenses: 20_000, months: 6 });
    expect(r.breakEvenRevenue).toBe(80_000);
    expect(r.breakEvenMonth).toBeNull(); // 50k * 25% = 12.5k < 20k
  });

  it('détecte le mois de passage au vert', () => {
    const r = projectBusiness({ monthlyRevenue: 60_000, monthlyGrowthPct: 15, marginRatePct: 40, monthlyExpenses: 30_000, months: 8 });
    expect(r.breakEvenMonth).not.toBeNull();
    expect(r.points[r.breakEvenMonth! - 1].profit).toBeGreaterThanOrEqual(0);
  });
});
