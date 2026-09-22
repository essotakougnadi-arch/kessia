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
// P1.12 — garde fail-closed : en production, si Upstash est absent OU
// en erreur, les routes d'authentification (préfixe `auth.` du nom
// passé à enforceRateLimit — login, register, 2FA, PIN, OTP,
// changement de mot de passe) refusent explicitement plutôt que de
// retomber silencieusement sur le compteur mémoire (inefficace en
// serverless : chaque invocation peut tourner sur une instance
// différente, donc sans protection anti-brute-force réelle). Les
// routes non-auth gardent le repli mémoire existant, inchangé — aucun
// changement de comportement pour elles. Hors production (dev/test/
// CI), comportement strictement inchangé : jamais de fail-closed, pas
// de dépendance obligatoire à Upstash.
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

// ── Configuration d'exécution — lue à chaque appel, jamais figée au
// chargement du module : les tests peuvent ainsi faire varier NODE_ENV /
// les variables Upstash sans réimporter le module. ────────────────────

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isUpstashConfigured(): boolean {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
}

function isE2eBypass(): boolean {
  return process.env.E2E_RATE_LIMIT_BYPASS === '1';
}

/** Routes protégées par la garde fail-closed (P1.12) — toutes les routes d'authentification. */
export function isCriticalRoute(name: string): boolean {
  return name.startsWith('auth.');
}

// ── Upstash Redis (production serverless) ──────────────────

type UpstashLimiter = {
  limit: (id: string) => Promise<{ success: boolean; remaining: number; reset: number }>;
};

// Le client Redis et les limiteurs sont mis en cache (coûteux à créer) —
// seule la DÉCISION d'y recourir (isUpstashConfigured) est réévaluée à
// chaque appel.
let redisClient: unknown = null;
const limiterCache = new Map<string, UpstashLimiter>();

async function getUpstashLimiter(limit: number, windowMs: number): Promise<UpstashLimiter | null> {
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
    console.error('[RATE-LIMIT] Échec d\'initialisation du client Upstash.', e);
    return null;
  }
}

type RateLimitSource = 'upstash' | 'memory';
type RateLimitOutcome = {
  result: RateLimitResult;
  source: RateLimitSource;
  /** Pourquoi le repli mémoire a été utilisé — absent si source === 'upstash'. */
  fallbackReason?: 'not_configured' | 'provider_error';
};

/** Évalue la limite et rapporte QUELLE source a répondu (utilisé par enforceRateLimit pour la garde fail-closed). */
async function evaluateRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitOutcome> {
  if (!isUpstashConfigured()) {
    return { result: rateLimit(key, limit, windowMs), source: 'memory', fallbackReason: 'not_configured' };
  }
  const rl = await getUpstashLimiter(limit, windowMs);
  if (!rl) {
    return { result: rateLimit(key, limit, windowMs), source: 'memory', fallbackReason: 'provider_error' };
  }
  try {
    const r = await rl.limit(key);
    return {
      source: 'upstash',
      result: {
        ok: r.success,
        remaining: Math.max(0, r.remaining),
        retryAfter: r.success ? 0 : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
      },
    };
  } catch (e) {
    console.error('[RATE-LIMIT] Erreur du fournisseur Upstash, repli mémoire.', e);
    return { result: rateLimit(key, limit, windowMs), source: 'memory', fallbackReason: 'provider_error' };
  }
}

/** Vérifie la limite (Upstash si configuré et opérationnel, sinon mémoire). Signature/comportement inchangés. */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  return (await evaluateRateLimit(key, limit, windowMs)).result;
}

// Diagnostic de démarrage (informatif uniquement — n'est utilisé par
// aucune décision de rate limiting, qui relit toujours l'environnement
// à chaque appel via isE2eBypass()/isUpstashConfigured() ci-dessus).
if (isE2eBypass()) {
  console.warn(
    '[SECURITY] Rate limiting DÉSACTIVÉ (E2E_RATE_LIMIT_BYPASS=1). ' +
      'Ne doit apparaître que dans un environnement de test.'
  );
} else if (isUpstashConfigured()) {
  console.info('[SECURITY] Rate limiting : Upstash Redis (partagé).');
}

// ── Helpers requête ────────────────────────────────────────

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * À appeler en tête d'un handler. Renvoie une réponse d'erreur si la
 * limite est dépassée OU (production + route `auth.*` + repli mémoire)
 * si la protection distribuée n'est pas opérationnelle — sinon `null`
 * (on continue). Asynchrone.
 */
export async function enforceRateLimit(
  request: NextRequest,
  name: string,
  opts: { limit: number; windowMs: number; by?: string }
): Promise<Response | null> {
  if (isE2eBypass()) return null;
  const subject = opts.by ?? clientIp(request);
  const outcome = await evaluateRateLimit(`${name}:${subject}`, opts.limit, opts.windowMs);

  if (outcome.source === 'memory' && isProductionEnv() && isCriticalRoute(name)) {
    // Fail-closed (P1.12) : ne jamais protéger une route d'authentification
    // par un compteur mémoire en production — celui-ci n'offre aucune
    // protection anti-brute-force réelle en environnement serverless
    // multi-instance. Aucun détail interne (raison, fournisseur) n'est
    // renvoyé au client.
    console.error(
      `[SECURITY] Rate limiting distribué indisponible pour une route protégée (${name}) en production — refus (fail-closed).`
    );
    return tooManyRequests('Service momentanément limité. Réessayez dans quelques instants.');
  }

  if (!outcome.result.ok) {
    return tooManyRequests(
      `Trop de tentatives. Réessayez dans ${outcome.result.retryAfter} seconde(s).`
    );
  }
  return null;
}
