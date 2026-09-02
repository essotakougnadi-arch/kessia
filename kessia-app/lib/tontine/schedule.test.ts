import { describe, it, expect } from 'vitest';
import { addFrequency } from './schedule';

describe('addFrequency', () => {
  it('ajoute 7 jours pour WEEKLY', () => {
    const d = addFrequency(new Date('2026-01-01T09:00:00Z'), 'WEEKLY');
    expect(d.toISOString()).toBe(new Date('2026-01-08T09:00:00Z').toISOString());
  });

  it('ajoute 14 jours pour BIWEEKLY', () => {
    const d = addFrequency(new Date('2026-01-01T09:00:00Z'), 'BIWEEKLY');
    expect(d.toISOString()).toBe(new Date('2026-01-15T09:00:00Z').toISOString());
  });

  it('ajoute 1 mois calendaire pour MONTHLY', () => {
    const d = addFrequency(new Date('2026-01-15T09:00:00Z'), 'MONTHLY');
    expect(d.getMonth()).toBe(1); // février
    expect(d.getDate()).toBe(15);
  });

  it('gère le passage de fin de mois pour MONTHLY (31 jan → mars)', () => {
    // JS: 31 janvier + 1 mois → 3 mars (février n'a pas de 31)
    const d = addFrequency(new Date('2026-01-31T09:00:00Z'), 'MONTHLY');
    expect(d.getMonth()).toBe(2); // mars
  });

  it('ne mute pas la date source', () => {
    const src = new Date('2026-01-01T09:00:00Z');
    addFrequency(src, 'WEEKLY');
    expect(src.toISOString()).toBe('2026-01-01T09:00:00.000Z');
  });
});
