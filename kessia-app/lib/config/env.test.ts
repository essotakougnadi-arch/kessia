// ============================================================
// KESSIA — lib/config/env.ts (P1.9, Lot A)
// ============================================================

import { describe, it, expect } from 'vitest';
import { validateEnv } from './env';

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe('validateEnv', () => {
  it('accepte une configuration de développement minimale', () => {
    const result = validateEnv(env({ NODE_ENV: 'development' }));
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('bloque DEMO_MODE=1 en production sans opt-in', () => {
    expect(() => validateEnv(env({ NODE_ENV: 'production', DEMO_MODE: '1' }))).toThrow(/DEMO_MODE/);
  });

  it("autorise DEMO_MODE=1 en production avec l'opt-in explicite ALLOW_DEMO_IN_PRODUCTION=1", () => {
    expect(() =>
      validateEnv(
        env({
          NODE_ENV: 'production',
          DEMO_MODE: '1',
          ALLOW_DEMO_IN_PRODUCTION: '1',
          JWT_SECRET: 'x',
          JWT_REFRESH_SECRET: 'y',
          DATABASE_URL: 'postgresql://u:p@h/db',
        })
      )
    ).not.toThrow();
  });

  it('DEMO_MODE=0 (ou absent) en production ne déclenche jamais le blocage', () => {
    expect(() =>
      validateEnv(
        env({
          NODE_ENV: 'production',
          DEMO_MODE: '0',
          JWT_SECRET: 'x',
          JWT_REFRESH_SECRET: 'y',
          DATABASE_URL: 'postgresql://u:p@h/db',
        })
      )
    ).not.toThrow();
  });

  it('signale (sans bloquer) les variables critiques absentes en production', () => {
    const result = validateEnv(env({ NODE_ENV: 'production' }));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining(['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'])
    );
  });

  it("n'exige pas les variables critiques hors production", () => {
    const result = validateEnv(env({ NODE_ENV: 'test' }));
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
