// ============================================================
// KESSIA — Validation des variables d'environnement (P1.9, Lot A)
//
// Validation MINIMALE, volontairement non exhaustive : signale les
// variables critiques absentes en production (sans bloquer — certaines
// restent optionnelles avec repli documenté ailleurs, ex. les webhooks)
// et bloque explicitement une seule combinaison dangereuse : DEMO_MODE
// actif en production sans opt-in nommé (DEMO_MODE expose les codes OTP
// dans les réponses de l'API — cf. lib/config/demo.ts).
//
// Ce module n'est PAS câblé dans le cycle de démarrage de l'application
// dans ce lot (hors périmètre du Lot A) — importer `validateEnv` (ou ce
// module, qui l'appelle une fois à son propre chargement) déclenche la
// vérification, comme lib/auth/session.ts le fait déjà pour JWT_SECRET.
// ============================================================

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DEMO_MODE: z.enum(['0', '1']).optional(),
  // Opt-in explicite et nommé — même convention que E2E_RATE_LIMIT_BYPASS.
  ALLOW_DEMO_IN_PRODUCTION: z.enum(['0', '1']).optional(),
  JWT_SECRET: z.string().min(1).optional(),
  JWT_REFRESH_SECRET: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
});

const CRITICAL_IN_PRODUCTION = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'] as const;

export type EnvValidationResult = {
  ok: boolean;
  /** Variables critiques absentes en production — signalé, pas bloquant ici. */
  missing: string[];
};

/**
 * Valide les variables d'environnement lues (par défaut `process.env`).
 * Lève une erreur UNIQUEMENT pour la combinaison DEMO_MODE=1 en
 * production sans `ALLOW_DEMO_IN_PRODUCTION=1` — le reste est rapporté
 * dans `missing` sans bloquer, pour ne pas casser un déploiement
 * existant sur une variable qui a par ailleurs son propre repli.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const parsed = envSchema.parse({
    NODE_ENV: env.NODE_ENV,
    DEMO_MODE: env.DEMO_MODE,
    ALLOW_DEMO_IN_PRODUCTION: env.ALLOW_DEMO_IN_PRODUCTION,
    JWT_SECRET: env.JWT_SECRET,
    JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET,
    DATABASE_URL: env.DATABASE_URL,
  });

  const isProd = parsed.NODE_ENV === 'production';

  if (isProd && parsed.DEMO_MODE === '1' && parsed.ALLOW_DEMO_IN_PRODUCTION !== '1') {
    throw new Error(
      "Configuration invalide : DEMO_MODE=1 en production expose les codes OTP dans les réponses de " +
        "l'API. Acceptable uniquement sur un déploiement de démonstration assumé — définir " +
        'ALLOW_DEMO_IN_PRODUCTION=1 explicitement pour confirmer ce choix, sinon retirer DEMO_MODE.'
    );
  }

  const missing = isProd ? CRITICAL_IN_PRODUCTION.filter((k) => !parsed[k]) : [];

  return { ok: missing.length === 0, missing };
}

validateEnv();
