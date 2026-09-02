import { describe, it, expect } from 'vitest';
import { buildGrowthSteps, type GrowthSignals } from './rules';
import { makeTranslate } from '@/lib/i18n/core';

const t = makeTranslate('fr');
const build = (s: GrowthSignals) => buildGrowthSteps(s, t);

const base: GrowthSignals = {
  kycVerified: true,
  kycStarted: false,
  twoFactorEnabled: true,
  walletOps: 20,
  activeTontines: 2,
  lateContributions: 0,
  scoreBand: 'FIABLE',
  scoreToNextBand: 40,
  businesses: [],
};

describe('buildGrowthSteps', () => {
  it('propose toujours la simulation d’épargne', () => {
    const keys = build(base).map((s) => s.key);
    expect(keys).toContain('simulate-goal');
  });

  it('propose la vérification KYC quand elle n’est pas faite', () => {
    const steps = build({ ...base, kycVerified: false });
    const kyc = steps.find((s) => s.key === 'kyc-verify');
    expect(kyc).toBeTruthy();
    expect(kyc!.impact).toBe(200);
  });

  it('propose la régularisation avant l’adhésion quand il y a des retards', () => {
    const keys = build({ ...base, activeTontines: 0, lateContributions: 2 }).map((s) => s.key);
    expect(keys).toContain('tontine-catchup');
    expect(keys).not.toContain('tontine-join');
  });

  it('génère des étapes par entreprise selon les signaux', () => {
    const steps = build({
      ...base,
      businesses: [{
        id: 'b1', name: 'Kossi Électro',
        salesCount30: 1, grossMarginRate: 12, lowStock: 2,
        recurringCustomers: 0, goalsCount: 0, suppliersCount: 0, openQuotes: 1,
      }],
    });
    const keys = steps.map((s) => s.key);
    expect(keys).toContain('business-b1-record-sales');
    expect(keys).toContain('business-b1-margin');
    expect(keys).toContain('business-b1-restock');
    expect(keys).toContain('business-b1-quotes');
  });

  it('ne génère pas d’étape entreprise quand tout va bien', () => {
    const steps = build({
      ...base,
      businesses: [{
        id: 'b2', name: 'OK Corp',
        salesCount30: 12, grossMarginRate: 40, lowStock: 0,
        recurringCustomers: 5, goalsCount: 2, suppliersCount: 3, openQuotes: 0,
      }],
    });
    expect(steps.some((s) => s.key.startsWith('business-b2-'))).toBe(false);
  });
});
