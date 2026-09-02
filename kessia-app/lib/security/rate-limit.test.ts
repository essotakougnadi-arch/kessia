import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimit, checkRateLimit } from './rate-limit';

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
