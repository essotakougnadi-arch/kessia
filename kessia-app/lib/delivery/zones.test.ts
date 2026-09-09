import { describe, expect, it } from 'vitest';
import { estimateFee, findZone, isCovered, LOME_ZONES } from './zones';

describe('delivery zones', () => {
  it('toutes les zones ont un anneau valide et une clé unique', () => {
    const keys = new Set<string>();
    for (const z of LOME_ZONES) {
      expect([0, 1, 2]).toContain(z.ring);
      expect(z.label.length).toBeGreaterThan(1);
      expect(keys.has(z.key)).toBe(false);
      keys.add(z.key);
    }
  });

  it('findZone / isCovered', () => {
    expect(findZone('tokoin')?.label).toBe('Tokoin');
    expect(findZone('paris')).toBeNull();
    expect(isCovered('agoe')).toBe(true);
    expect(isCovered(null)).toBe(false);
    expect(isCovered('kara')).toBe(false);
  });

  it('estime un tarif borné et croissant avec la distance', () => {
    const same = estimateFee('be', 'be'); // même anneau centre
    const near = estimateFee('be', 'tokoin'); // centre → intermédiaire
    const far = estimateFee('centre-ville', 'baguida'); // centre → périphérie
    for (const e of [same, near, far]) {
      expect(e.covered).toBe(true);
      expect(e.amount).toBeGreaterThanOrEqual(500);
      expect(e.amount).toBeLessThanOrEqual(1600);
      expect(e.amount % 50).toBe(0);
      expect(e.etaMinutes).toBeGreaterThan(0);
    }
    expect(near.amount).toBeGreaterThanOrEqual(same.amount);
    expect(far.amount).toBeGreaterThan(same.amount);
    expect(far.etaMinutes).toBeGreaterThan(same.etaMinutes);
  });

  it('hors couverture → covered:false, montant neutre', () => {
    const e = estimateFee('be', 'kara');
    expect(e.covered).toBe(false);
    expect(e.amount).toBe(0);
    const e2 = estimateFee(null, 'be');
    expect(e2.covered).toBe(false);
  });
});
