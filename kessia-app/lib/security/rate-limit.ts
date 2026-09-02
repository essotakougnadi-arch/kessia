// ============================================================
// KESSIA — Rate limiting (cahier des charges §31)
//
// Deux implémentations, sélectionnées à l'exécution :
//  • Upstash Redis (fenêtre glissante) si UPSTASH_REDIS_REST_URL /
//    UPSTASH_REDIS_REST_TOKEN sont définis → compteur PARTAGÉ entre
//    toutes les instances serverless.
//  • Sinon : compteur en mémoire (mono-instance) — suffisant en dev
//    et pour la suite de tests.
//
// Voir docs/decisions/0004 et 0014.
// ============================================================

import type { NextRequest } from 'next/server';
import { tooManyRequests } from '@/lib/utils/response';

// ── Compteur en mémoire (fallback) ─────────────────────────

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function sweep(now: number) {
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

export type RateLimitResult = { ok: boolean; remaining: number; retryAfter: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > 10_000) sweep(now);

  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  b.count += 1;
  if (b.count > limit) {
    return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, remaining: limit - b.count, retryAfter: 0 };
}

// ── Upstash Redis (production serverless) ──────────────────

type UpstashLimiter = {
  limit: (id: string) => Promise<{ success: boolean; remaining: number; reset: number }>;
};

const UPSTASH_ENABLED =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

let redisClient: unknown = null;
const limiterCache = new Map<string, UpstashLimiter>();

async function upstashLimiter(limit: number, windowMs: number): Promise<UpstashLimiter | null> {
  if (!UPSTASH_ENABLED) return null;
  const cacheKey = `${limit}:${windowMs}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;
  try {
    const { Redis } = await import('@upstash/redis');
    const { Ratelimit } = await import('@upstash/ratelimit');
    if (!redisClient) redisClient = Redis.fromEnv();
    const seconds = Math.max(1, Math.ceil(windowMs / 1000));
    const rl = new Ratelimit({
      redis: redisClient as never,
      limiter: Ratelimit.slidingWindow(limit, `${seconds} s`),
      prefix: 'kessia:rl',
      analytics: false,
    }) as unknown as UpstashLimiter;
    limiterCache.set(cacheKey, rl);
    return rl;
  } catch (e) {
    console.error('[RATE-LIMIT] Upstash indisponible, repli mémoire.', e);
    return null;
  }
}

/** Vérifie la limite (Upstash si configuré, sinon mémoire). */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const rl = await upstashLimiter(limit, windowMs);
  if (rl) {
    try {
      const r = await rl.limit(key);
      return {
        ok: r.success,
        remaining: Math.max(0, r.remaining),
        retryAfter: r.success ? 0 : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
      };
    } catch (e) {
      console.error('[RATE-LIMIT] échec Upstash, repli mémoire.', e);
    }
  }
  return rateLimit(key, limit, windowMs);
}

// ── Helpers requête ────────────────────────────────────────

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// Contournement réservé aux tests automatisés (la suite E2E tourne sur un
// build de production et enchaîne les connexions depuis une seule IP).
// Opt-in EXPLICITE via `E2E_RATE_LIMIT_BYPASS=1` — à ne JAMAIS définir sur
// un déploiement réel. Non défini = rate limiting pleinement actif.
const E2E_BYPASS = process.env.E2E_RATE_LIMIT_BYPASS === '1';
if (E2E_BYPASS) {
  console.warn(
    '[SECURITY] Rate limiting DÉSACTIVÉ (E2E_RATE_LIMIT_BYPASS=1). ' +
      'Ne doit apparaître que dans un environnement de test.'
  );
} else if (UPSTASH_ENABLED) {
  console.info('[SECURITY] Rate limiting : Upstash Redis (partagé).');
}

/**
 * À appeler en tête d'un handler. Renvoie une réponse 429 si la limite
 * est dépassée, sinon `null` (on continue). Asynchrone.
 */
export async function enforceRateLimit(
  request: NextRequest,
  name: string,
  opts: { limit: number; windowMs: number; by?: string }
): Promise<Response | null> {
  if (E2E_BYPASS) return null;
  const subject = opts.by ?? clientIp(request);
  const res = await checkRateLimit(`${name}:${subject}`, opts.limit, opts.windowMs);
  if (!res.ok) {
    return tooManyRequests(
      `Trop de tentatives. Réessayez dans ${res.retryAfter} seconde(s).`
    );
  }
  return null;
}
