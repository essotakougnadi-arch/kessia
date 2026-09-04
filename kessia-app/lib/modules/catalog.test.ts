import { describe, it, expect } from 'vitest';
import { MODULES, LIVE_MODULES, UPCOMING_MODULES, INTEREST_KEYS, moduleByKey } from './catalog';

describe('module catalog', () => {
  it('chaque module LIVE a une route (href)', () => {
    for (const m of LIVE_MODULES) {
      expect(m.href, `${m.key} devrait avoir un href`).toBeTruthy();
    }
  });

  it('les modules non-LIVE (SOON/REGULATED) sont dans UPCOMING_MODULES', () => {
    expect(UPCOMING_MODULES.every((m) => m.status !== 'LIVE')).toBe(true);
    expect(LIVE_MODULES.every((m) => m.status === 'LIVE')).toBe(true);
    expect(LIVE_MODULES.length + UPCOMING_MODULES.length).toBe(MODULES.length);
  });

  it('Invest et Insurance restent REGULATED (aucune promesse de rendement / pas assureur)', () => {
    expect(moduleByKey('invest')?.status).toBe('REGULATED');
    expect(moduleByKey('insurance')?.status).toBe('REGULATED');
  });

  it("INTEREST_KEYS couvre les modules à venir + les sous-fonctionnalités hors catalogue", () => {
    for (const m of UPCOMING_MODULES) {
      expect(INTEREST_KEYS).toContain(m.key);
    }
    expect(INTEREST_KEYS).toContain('diaspora_transfer');
    // Un module LIVE (ex. diaspora, marketplace) n'a pas besoin de clé d'intérêt propre.
    expect(INTEREST_KEYS).not.toContain('diaspora');
    expect(INTEREST_KEYS).not.toContain('market');
  });

  it('moduleByKey retrouve un module existant et renvoie undefined sinon', () => {
    expect(moduleByKey('learn')?.name).toBe('KESSIA Academy');
    expect(moduleByKey('does-not-exist')).toBeUndefined();
  });
});
