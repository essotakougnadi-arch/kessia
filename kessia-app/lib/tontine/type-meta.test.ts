import { describe, it, expect } from 'vitest';
import {
  TONTINE_TYPES,
  tontineTypeMeta,
  totalRoundsForType,
  resolveDistribution,
  soloContributionAmount,
} from './type-meta';

describe('type-meta', () => {
  it('expose exactement 4 types', () => {
    expect(TONTINE_TYPES.map((t) => t.key)).toEqual([
      'CLASSIC_ROTATING',
      'PROJECT',
      'GROWTH',
      'PURCHASE',
    ]);
  });

  it('chaque type a un libellé, une description et des étapes', () => {
    for (const t of TONTINE_TYPES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.howItWorks.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('totalRoundsForType : rotating/growth = 1 tour par membre, project = 1', () => {
    expect(totalRoundsForType('CLASSIC_ROTATING', 6)).toBe(6);
    expect(totalRoundsForType('PURCHASE', 6)).toBe(6);
    expect(totalRoundsForType('GROWTH', 6)).toBe(6);
    expect(totalRoundsForType('PROJECT', 6)).toBe(1);
  });

  it('tontineTypeMeta retombe sur CLASSIC_ROTATING pour une valeur inconnue', () => {
    // @ts-expect-error test d'un cas hors enum
    expect(tontineTypeMeta('WHATEVER').key).toBe('CLASSIC_ROTATING');
  });

  it('resolveDistribution : Achat SOLO → solo, Achat GROUP → rotating', () => {
    expect(resolveDistribution('PURCHASE', 'SOLO')).toBe('solo');
    expect(resolveDistribution('PURCHASE', 'GROUP')).toBe('rotating');
    expect(resolveDistribution('PURCHASE', null)).toBe('rotating');
    expect(resolveDistribution('PURCHASE', undefined)).toBe('rotating');
    // le sous-mode n'affecte que la tontine Achat
    expect(resolveDistribution('GROWTH', 'SOLO')).toBe('growth');
    expect(resolveDistribution('CLASSIC_ROTATING', 'SOLO')).toBe('rotating');
    expect(resolveDistribution('PROJECT', 'SOLO')).toBe('project');
  });

  it('totalRoundsForType : Achat SOLO = nombre de versements choisi', () => {
    expect(totalRoundsForType('PURCHASE', 1, { purchaseMode: 'SOLO', plannedRounds: 6 })).toBe(6);
    expect(totalRoundsForType('PURCHASE', 1, { purchaseMode: 'SOLO', plannedRounds: 1 })).toBe(1);
    // sans plannedRounds → 1 (garde-fou)
    expect(totalRoundsForType('PURCHASE', 8, { purchaseMode: 'SOLO' })).toBe(1);
    // Achat GROUP inchangé
    expect(totalRoundsForType('PURCHASE', 8, { purchaseMode: 'GROUP', plannedRounds: 3 })).toBe(8);
  });

  it('soloContributionAmount : prix / versements, arrondi à l’unité, ≥ 1', () => {
    expect(soloContributionAmount(240_000, 6)).toBe(40_000);
    expect(soloContributionAmount(250_000, 6)).toBe(41_667); // arrondi
    expect(soloContributionAmount(100, 1_000)).toBe(1); // plancher
    expect(soloContributionAmount(0, 6)).toBe(0);
    expect(soloContributionAmount(1000, 0)).toBe(0);
  });
});
