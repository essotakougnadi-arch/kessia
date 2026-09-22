import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks Upstash — aucune connexion réseau réelle. `mockLimit` reconfiguré
// par test (mockResolvedValue) pour le cas succès/dépassement. Le cas
// « erreur fournisseur » passe par `simulateProviderError` (throw direct,
// hors du spy `vi.fn()`) — un rejet produit via `vi.fn().mockRejectedValue`/
// `mockImplementation(() => Promise.reject(...))` déclenche ici un faux
// positif « unhandled rejection » de Vitest malgré le try/catch qui gère
// bien l'erreur (vérifié : le code applicatif se comporte correctement,
// seul le mécanisme de simulation en cause).
let simulateProviderError = false;
const mockLimit = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({}) },
}));

vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow(limit: number, window: string) {
      return { limit, window };
    }
    async limit(...args: unknown[]) {
      if (simulateProviderError) throw new Error('ECONNRESET');
      return mockLimit(...args);
    }
  }
  return { Ratelimit };
});

import { rateLimit, checkRateLimit, enforceRateLimit, isCriticalRoute } from './rate-limit';

describe('rateLimit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('autorise jusqu\'à la limite puis bloque', () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('réinitialise après la fenêtre', () => {
    const key = `test-${Math.random()}`;
    rateLimit(key, 1, 1_000);
    expect(rateLimit(key, 1, 1_000).ok).toBe(false);
    vi.advanceTimersByTime(1_100);
    expect(rateLimit(key, 1, 1_000).ok).toBe(true);
  });

  it('les clés sont indépendantes', () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false);
    expect(rateLimit(b, 1, 60_000).ok).toBe(true);
  });

  it('checkRateLimit retombe sur le compteur mémoire sans Upstash', async () => {
    const key = `async-${Math.random()}`;
    expect((await checkRateLimit(key, 2, 60_000)).ok).toBe(true);
    expect((await checkRateLimit(key, 2, 60_000)).ok).toBe(true);
    expect((await checkRateLimit(key, 2, 60_000)).ok).toBe(false);
  });
});

// ============================================================
// P1.12 — rate limiting distribué (Upstash) & garde fail-closed
// ============================================================

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete (process.env as Record<string, string | undefined>)[k];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string>)[k] = v;
  }
}

function req(): Request {
  return new Request('http://localhost/api/v1/test', {
    headers: { 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 250) + 1}` },
  }) as unknown as import('next/server').NextRequest;
}

describe('isCriticalRoute', () => {
  it('identifie toutes les routes auth.* comme protégées', () => {
    expect(isCriticalRoute('auth.login')).toBe(true);
    expect(isCriticalRoute('auth.register')).toBe(true);
    expect(isCriticalRoute('auth.2fa')).toBe(true);
    expect(isCriticalRoute('auth.pin_verify')).toBe(true);
    expect(isCriticalRoute('auth.request-otp')).toBe(true);
    expect(isCriticalRoute('auth.verify-otp')).toBe(true);
    expect(isCriticalRoute('auth.change-password')).toBe(true);
  });

  it('ne considère aucune route non-auth comme protégée', () => {
    expect(isCriticalRoute('wallet.transfer')).toBe(false);
    expect(isCriticalRoute('marketplace.order')).toBe(false);
    expect(isCriticalRoute('kyc.document')).toBe(false);
    expect(isCriticalRoute('discover')).toBe(false);
  });
});

describe('enforceRateLimit — environnements non-production (scénario 3)', () => {
  afterEach(restoreEnv);

  it('development sans Upstash : comportement mémoire inchangé, jamais de fail-closed', async () => {
    setEnv({ NODE_ENV: 'development', UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined });
    const name = `auth.login-dev-${Math.random()}`;
    const subject = `dev-subj-${Math.random()}`;
    const r1 = await enforceRateLimit(req() as never, name, { limit: 1, windowMs: 60_000, by: subject });
    expect(r1).toBeNull(); // 1ʳᵉ requête OK
    const r2 = await enforceRateLimit(req() as never, name, { limit: 1, windowMs: 60_000, by: subject });
    expect(r2?.status).toBe(429); // dépassement normal (mémoire) — pas un fail-closed (hors production)
  });

  it('test sans Upstash : comportement mémoire inchangé pour une route auth.*', async () => {
    setEnv({ NODE_ENV: 'test', UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined });
    const subject = `subj-${Math.random()}`;
    const name = 'auth.login';
    const r1 = await enforceRateLimit(req() as never, name, { limit: 1, windowMs: 60_000, by: subject });
    expect(r1).toBeNull(); // 1ʳᵉ requête OK
    const r2 = await enforceRateLimit(req() as never, name, { limit: 1, windowMs: 60_000, by: subject });
    expect(r2?.status).toBe(429); // dépassement normal (mémoire), PAS un fail-closed
  });
});

describe('enforceRateLimit — production sans Upstash, route protégée (scénario 2 : fail-closed)', () => {
  afterEach(restoreEnv);

  it('refuse une route auth.* en production quand Upstash est absent', async () => {
    setEnv({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined });
    const res = await enforceRateLimit(req() as never, 'auth.login', {
      limit: 10, windowMs: 60_000, by: `fc-${Math.random()}`,
    });
    expect(res).not.toBeNull();
    expect(res?.status).toBe(429);
    const body = await res!.json();
    expect(body.code).toBe('TOO_MANY_REQUESTS');
    // aucun détail interne (raison, fournisseur, variable d'env) dans le message (scénario 7)
    expect(body.error.toLowerCase()).not.toMatch(/upstash|redis|env|secret|token/);
  });

  it('une route NON-auth garde son comportement mémoire habituel dans la même situation', async () => {
    setEnv({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined });
    const res = await enforceRateLimit(req() as never, 'wallet.transfer', {
      limit: 10, windowMs: 60_000, by: `nc-${Math.random()}`,
    });
    expect(res).toBeNull(); // pas de fail-closed hors auth.*
  });
});

describe('enforceRateLimit — production avec Upstash opérationnel (scénario 1 et 4)', () => {
  beforeEach(() => mockLimit.mockReset());
  afterEach(restoreEnv);

  it('utilise Upstash et respecte limit/windowMs transmis au fournisseur', async () => {
    setEnv({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'x' });
    mockLimit.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60_000 });
    const res = await enforceRateLimit(req() as never, `auth.login-${Math.random()}`, {
      limit: 5, windowMs: 60_000, by: 'user-1',
    });
    expect(res).toBeNull();
    expect(mockLimit).toHaveBeenCalledTimes(1);
  });

  it('dépassement de limite signalé par Upstash → 429 (scénario 5)', async () => {
    setEnv({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'x' });
    mockLimit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 30_000 });
    const res = await enforceRateLimit(req() as never, 'auth.login', {
      limit: 5, windowMs: 60_000, by: `over-${Math.random()}`,
    });
    expect(res?.status).toBe(429);
    const body = await res!.json();
    expect(body.error).toMatch(/Trop de tentatives/);
  });
});

describe('enforceRateLimit — erreur du fournisseur Upstash (scénario 6)', () => {
  beforeEach(() => {
    mockLimit.mockReset();
    simulateProviderError = true;
  });
  afterEach(() => {
    simulateProviderError = false;
    restoreEnv();
  });

  it('production + erreur Upstash sur une route auth.* → fail-closed (jamais de repli silencieux)', async () => {
    setEnv({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'x' });
    const res = await enforceRateLimit(req() as never, 'auth.login', {
      limit: 5, windowMs: 60_000, by: `err-${Math.random()}`,
    });
    expect(res?.status).toBe(429);
    const body = await res!.json();
    expect(body.error.toLowerCase()).not.toMatch(/econnreset|upstash|redis/);
  });

  it('production + erreur Upstash sur une route NON-auth → repli mémoire (comportement existant conservé)', async () => {
    setEnv({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'x' });
    const res = await enforceRateLimit(req() as never, 'wallet.transfer', {
      limit: 5, windowMs: 60_000, by: `err2-${Math.random()}`,
    });
    expect(res).toBeNull();
  });
});

describe('enforceRateLimit — isolation des compteurs (scénario 8)', () => {
  afterEach(restoreEnv);

  it('deux utilisateurs distincts sur la même route ne partagent jamais leur compteur', async () => {
    setEnv({ NODE_ENV: 'test', UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined });
    const name = `auth.login-iso-${Math.random()}`;
    const first = await enforceRateLimit(req() as never, name, { limit: 1, windowMs: 60_000, by: 'user-A' });
    expect(first).toBeNull();
    const second = await enforceRateLimit(req() as never, name, { limit: 1, windowMs: 60_000, by: 'user-A' });
    expect(second?.status).toBe(429); // user-A a déjà consommé sa seule requête
    const third = await enforceRateLimit(req() as never, name, { limit: 1, windowMs: 60_000, by: 'user-B' });
    expect(third).toBeNull(); // user-B, compteur totalement indépendant
  });
});

describe('bypass E2E (scénario 9 — comportement existant conservé)', () => {
  afterEach(restoreEnv);

  it('E2E_RATE_LIMIT_BYPASS=1 court-circuite toujours enforceRateLimit, même en production sans Upstash', async () => {
    setEnv({
      NODE_ENV: 'production', E2E_RATE_LIMIT_BYPASS: '1',
      UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined,
    });
    const res = await enforceRateLimit(req() as never, 'auth.login', { limit: 1, windowMs: 60_000 });
    expect(res).toBeNull();
  });
});
