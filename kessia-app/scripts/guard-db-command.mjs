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
// Refuse l'exécution si DATABASE_URL correspond à une référence de
// projet Supabase de PRODUCTION connue — même motif que la garde déjà
// en place et prouvée en CI (.github/workflows/staging.yml, e2e.yml,
// integration.yml). N'affiche JAMAIS l'URL complète (identifiants
// inclus) — voir redactUrl(). Résout DATABASE_URL exactement comme le
// fait Prisma CLI : process.env, puis .env (jamais .env.local — voir
// le commentaire dédié en tête de .env).
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

/** Résout DATABASE_URL comme le fait Prisma CLI : process.env, puis .env (jamais .env.local). */
export function resolveDatabaseUrl(cwd = process.cwd(), env = process.env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const p = join(cwd, '.env');
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, 'utf8').match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  return m ? m[1].trim() : undefined;
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) {
    console.error('Usage : node scripts/guard-db-command.mjs <commande> [args...]');
    process.exit(1);
  }

  const url = resolveDatabaseUrl();
  if (isProductionDatabaseUrl(url)) {
    console.error('::error::REFUS — cette commande peut modifier ou effacer des données ; DATABASE_URL cible la base de PRODUCTION.');
    console.error(`::error::Cible détectée : ${redactUrl(url)}`);
    console.error(`::error::Commande bloquée : ${[cmd, ...args].join(' ')}`);
    console.error('::error::Pour agir sur la production, passez par le pipeline de déploiement documenté (jamais depuis un poste local).');
    process.exit(1);
  }

  execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
