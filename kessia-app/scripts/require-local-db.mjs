#!/usr/bin/env node
// ============================================================
// KESSIA — Garde ALLOWLIST pour toute commande Prisma destinée à la
// base de test locale (proposé suite à l'incident du 2026-10-12, voir
// docs/audit/INCIDENT_2026-10-12_prisma_adhoc_connection.md).
//
// Différence avec scripts/guard-db-command.mjs (DENYLIST : refuse un
// marqueur de production connu) : ceci est une ALLOWLIST. Elle exige :
//   1. DATABASE_URL et DIRECT_URL tous deux fournis explicitement
//      (aucun repli silencieux sur .env accepté) ;
//   2. strictement identiques entre eux ;
//   3. strictement identiques à la valeur documentée dans .env.test ;
//   4. hôte loopback (127.0.0.1/localhost) — défense en profondeur
//      même si .env.test lui-même était un jour mal configuré.
//
// Une DENYLIST ne protège que contre une cible déjà connue comme
// dangereuse. Cette ALLOWLIST protège contre TOUTE cible qui n'est pas
// explicitement et positivement la base de test attendue — y compris
// une invocation Prisma ad hoc non encore écrite (c'est exactement ce
// qui a échappé à guard-db-command.mjs lors de l'incident : une
// commande tapée directement, jamais passée par un script protégé).
//
// PROPOSÉ, PAS ENCORE CÂBLÉ : aucun script package.json n'appelle ce
// module pour le moment. Voir le rapport d'incident pour le câblage
// proposé (nouveau script `db:test:status`, et remplacement de la
// vérification de db-test-reset.mjs par celle-ci pour éviter la
// duplication de logique entre les deux fichiers).
// ============================================================

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function readEnvVar(file, name, cwd) {
  const p = join(cwd, file);
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, 'utf8').match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?`, 'm'));
  return m ? m[1].trim() : undefined;
}

/** Masque les identifiants d'une URL — jamais de secret en clair dans un log. */
export function redactUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return '(absent)';
  return url.replace(/:\/\/[^\s/:@]+:[^\s/:@]+@/, '://***@');
}

/** Hôte explicitement autorisé pour toute cible « locale de test ». */
export function isLoopbackUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  try {
    const u = new URL(url);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  } catch {
    return false;
  }
}

/**
 * Vérifie que databaseUrl ET directUrl sont tous deux définis,
 * identiques l'un à l'autre, identiques à la valeur attendue (lue dans
 * .env.test), ET pointent vers un hôte loopback. Ne lève jamais —
 * renvoie toujours { ok, reason? }.
 * @param {{ databaseUrl?: string, directUrl?: string, cwd?: string }} [opts]
 */
export function assertLocalTestPair({ databaseUrl, directUrl, cwd = process.cwd() } = {}) {
  if (!databaseUrl) {
    return { ok: false, reason: 'DATABASE_URL non fourni explicitement (aucun repli silencieux autorisé).' };
  }
  if (!directUrl) {
    return { ok: false, reason: 'DIRECT_URL non fourni explicitement (aucun repli silencieux autorisé) — c\'est exactement la variable omise lors de l\'incident du 2026-10-12.' };
  }
  if (databaseUrl !== directUrl) {
    return {
      ok: false,
      reason: `DATABASE_URL et DIRECT_URL diffèrent (${redactUrl(databaseUrl)} vs ${redactUrl(directUrl)}) — les deux doivent cibler exactement la même base de test.`,
    };
  }

  const expected = readEnvVar('.env.test', 'DATABASE_URL', cwd);
  if (!expected) {
    return { ok: false, reason: '.env.test introuvable ou DATABASE_URL absent de .env.test — rien à comparer.' };
  }
  if (databaseUrl !== expected) {
    return {
      ok: false,
      reason: `Ne correspond pas à .env.test (attendu ${redactUrl(expected)}, reçu ${redactUrl(databaseUrl)}).`,
    };
  }

  if (!isLoopbackUrl(databaseUrl)) {
    return {
      ok: false,
      reason: `Hôte non-loopback refusé même s'il correspond à .env.test (${redactUrl(databaseUrl)}) — défense en profondeur si .env.test est mal configuré.`,
    };
  }

  return { ok: true };
}

/**
 * Variante qui affiche l'erreur et quitte le process (usage CLI).
 * @param {{ databaseUrl?: string, directUrl?: string, cwd?: string }} [opts]
 */
export function requireLocalTestPairOrExit({
  databaseUrl = process.env.DATABASE_URL,
  directUrl = process.env.DIRECT_URL,
  cwd = process.cwd(),
} = {}) {
  const result = assertLocalTestPair({ databaseUrl, directUrl, cwd });
  if (!result.ok) {
    console.error(`::error::REFUS — ${result.reason}`);
    process.exit(1);
  }
  return result;
}
