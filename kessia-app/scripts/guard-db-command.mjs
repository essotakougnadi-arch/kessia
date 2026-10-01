#!/usr/bin/env node
// ============================================================
// KESSIA — Garde contre les commandes de base de données destructives
// exécutées accidentellement contre la production (P1.9, Lot B)
//
//   node scripts/guard-db-command.mjs <commande> [args...]
//
// Protège db:seed / db:push / db:migrate / db:migrate:deploy / db:studio
// (voir package.json). `db:seed` en particulier efface la quasi-totalité
// des tables (prisma/seed.ts) avant de réensemencer — lancé par erreur
// contre la production, il l'effacerait irréversiblement.
//
// Refuse l'exécution si DATABASE_URL ou DIRECT_URL (P1.11 — séparation
// runtime/migration, prisma/schema.prisma, ADR 0049) correspond à une
// référence de projet Supabase de PRODUCTION connue — même motif que la
// garde déjà en place et prouvée en CI (.github/workflows/staging.yml,
// e2e.yml, integration.yml). N'affiche JAMAIS l'URL complète
// (identifiants inclus) — voir redactUrl(). Résout chaque variable
// exactement comme le fait Prisma CLI : process.env, puis .env (jamais
// .env.local — voir le commentaire dédié en tête de .env).
//
// P1.11 — DIRECT_URL (migrations) doit en plus être refusée si elle
// cible le pooler Supabase en mode TRANSACTION (port 6543 et/ou
// pgbouncer=true) : ce mode casse le DDL de Prisma Migrate (ADR 0002,
// ADR 0048) — sans cette garde explicite, l'erreur ne serait détectée
// qu'à l'échec tardif de la commande Prisma elle-même.
// ============================================================

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Référence(s) de projet Supabase de PRODUCTION connue(s). Même valeur
// que le garde-fou déjà en place dans staging.yml — à tenir synchronisée
// si le projet de production change un jour.
export const PRODUCTION_MARKERS = ['uwvnarmojdbutbunzqww'];

/** Masque les identifiants d'une URL de connexion — jamais de secret en clair dans un log. */
export function redactUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return '(absent)';
  return url.replace(/:\/\/[^\s/:@]+:[^\s/:@]+@/, '://***@');
}

/**
 * Détecte une URL de base de données de PRODUCTION connue. Simple
 * correspondance de sous-chaîne, volontairement : robuste face à une
 * URL malformée ou incomplète (ne lève jamais, ne dépend d'aucun
 * parsing strict) et aux variantes de pooler (mode session/transaction,
 * ports différents, mêmes hôtes possibles pour un même projet).
 */
export function isProductionDatabaseUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  return PRODUCTION_MARKERS.some((marker) => url.includes(marker));
}

/**
 * Détecte le pooler Supabase en mode TRANSACTION (port 6543 et/ou
 * `pgbouncer=true`) — ce mode casse le DDL de Prisma Migrate (ADR 0002,
 * ADR 0048). Jamais acceptable pour DIRECT_URL (P1.11, ADR 0049).
 * Même robustesse que isProductionDatabaseUrl : ne lève jamais.
 */
export function isTransactionPoolerUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  return /:6543\b/.test(url) || /pgbouncer=true/i.test(url);
}

/** Résout une variable de connexion comme le fait Prisma CLI : process.env, puis .env (jamais .env.local). */
export function resolveEnvUrl(name, cwd = process.cwd(), env = process.env) {
  if (env[name]) return env[name];
  const p = join(cwd, '.env');
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, 'utf8').match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?`, 'm'));
  return m ? m[1].trim() : undefined;
}

/** DATABASE_URL (runtime). Conservé pour compatibilité avec les appelants existants. */
export function resolveDatabaseUrl(cwd = process.cwd(), env = process.env) {
  return resolveEnvUrl('DATABASE_URL', cwd, env);
}

/** DIRECT_URL (P1.11 — connexion dédiée aux migrations Prisma). */
export function resolveDirectUrl(cwd = process.cwd(), env = process.env) {
  return resolveEnvUrl('DIRECT_URL', cwd, env);
}

function refuse(reason, url, cmd, args) {
  console.error(`::error::REFUS — ${reason}`);
  console.error(`::error::Cible détectée : ${redactUrl(url)}`);
  console.error(`::error::Commande bloquée : ${[cmd, ...args].join(' ')}`);
  process.exit(1);
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) {
    console.error('Usage : node scripts/guard-db-command.mjs <commande> [args...]');
    process.exit(1);
  }

  const databaseUrl = resolveDatabaseUrl();
  if (isProductionDatabaseUrl(databaseUrl)) {
    refuse(
      "cette commande peut modifier ou effacer des données ; DATABASE_URL cible la base de PRODUCTION. Pour agir sur la production, passez par le pipeline de déploiement documenté (jamais depuis un poste local).",
      databaseUrl,
      cmd,
      args
    );
  }

  // P1.11 — DIRECT_URL (migrations) : même garde anti-production que
  // DATABASE_URL, PLUS un refus explicite si elle cible le pooler
  // transaction (casse le DDL de Prisma Migrate).
  const directUrl = resolveDirectUrl();
  if (isProductionDatabaseUrl(directUrl)) {
    refuse(
      "cette commande peut modifier ou effacer des données ; DIRECT_URL cible la base de PRODUCTION. Pour agir sur la production, passez par le pipeline de déploiement documenté (jamais depuis un poste local).",
      directUrl,
      cmd,
      args
    );
  }
  if (isTransactionPoolerUrl(directUrl)) {
    refuse(
      "DIRECT_URL cible le pooler Supabase en mode TRANSACTION (port 6543 et/ou pgbouncer=true) — ce mode casse le DDL de Prisma Migrate (ADR 0002, ADR 0048). DIRECT_URL doit utiliser le pooler SESSION (port 5432).",
      directUrl,
      cmd,
      args
    );
  }

  execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
