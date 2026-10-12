#!/usr/bin/env node
// ============================================================
// KESSIA — Relais sûr pour une commande Prisma de diagnostic contre la
// base de test locale UNIQUEMENT.
//
//   node scripts/run-local-only.mjs prisma migrate status
//   (voir le script npm `db:test:status`)
//
// Proposé suite à l'incident du 2026-10-12
// (docs/audit/INCIDENT_2026-10-12_PRISMA_ADHOC_CONNECTION.md) : aucun
// script npm ne couvrait les commandes Prisma de lecture, ce qui a
// naturellement poussé vers un `npx prisma migrate status` tapé
// directement — lequel a contourné tous les garde-fous existants
// (DATABASE_URL remplacée, DIRECT_URL non remplacée, repli silencieux
// sur .env de production).
//
// Ce script résout DATABASE_URL/DIRECT_URL (process.env, puis
// .env.test — jamais .env), exige qu'ils passent assertLocalTestPair()
// (scripts/require-local-db.mjs — ALLOWLIST, hôte loopback obligatoire)
// AVANT tout appel à la commande demandée, et transmet les DEUX
// variables explicitement à l'enfant (jamais de repli implicite laissé
// à la charge de Prisma).
//
// CE QUE CE SCRIPT GARANTIT (prouvé par run-local-only.test.ts,
// execFileSync moqué — aucune commande réelle dans ces tests) :
//   - Si DATABASE_URL/DIRECT_URL ne forment pas la paire locale
//     attendue, la commande demandée n'est JAMAIS exécutée (le mock
//     d'exécution n'est jamais appelé).
//   - Si la paire est valide, la commande reçoit explicitement les deux
//     variables résolues — jamais une variable laissée à la charge du
//     chargement natif de Prisma.
//   - La régression exacte de l'incident (DATABASE_URL fournie, DIRECT_URL
//     absente) est testée nommément et refusée.
//
// CE QUE CE SCRIPT NE GARANTIT PAS (voir aussi require-local-db.mjs) :
//   - Il ne protège QUE les commandes qui passent par LUI. Une commande
//     Prisma tapée directement dans un terminal (`npx prisma …`) le
//     contourne entièrement — exactement comme l'incident lui-même.
//     Rien au niveau applicatif de ce dépôt ne peut garantir que ce
//     chemin sera utilisé plutôt qu'un appel direct.
// ============================================================

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertLocalTestPair, redactUrl } from './require-local-db.mjs';

function readEnvVar(file, name, cwd) {
  const p = join(cwd, file);
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, 'utf8').match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?`, 'm'));
  return m ? m[1].trim() : undefined;
}

/**
 * @param {{ argv?: string[], cwd?: string, env?: NodeJS.ProcessEnv, exit?: (code: number) => unknown, exec?: typeof execFileSync }} [opts]
 */
export function main({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env: inputEnv = process.env,
  exit = process.exit,
  exec = execFileSync,
} = {}) {
  const [cmd, ...args] = argv;
  if (!cmd) {
    console.error('Usage : node scripts/run-local-only.mjs <commande> [args...]');
    return exit(1);
  }

  // Résolution explicite — jamais laissée à la charge du chargement
  // natif de Prisma. DIRECT_URL retombe sur DATABASE_URL UNIQUEMENT si
  // .env.test ne la définit pas séparément (même motif documenté et
  // testé que db-test-reset.mjs) — jamais sur une variable non définie.
  const databaseUrl = inputEnv.DATABASE_URL || readEnvVar('.env.test', 'DATABASE_URL', cwd);
  const directUrl = inputEnv.DIRECT_URL || readEnvVar('.env.test', 'DIRECT_URL', cwd) || databaseUrl;

  const result = assertLocalTestPair({ databaseUrl, directUrl, cwd });
  if (!result.ok) {
    console.error(`::error::REFUS — ${result.reason}`);
    console.error(`::error::Commande bloquée : ${[cmd, ...args].join(' ')}`);
    return exit(1);
  }

  console.log(`Cible locale confirmée : ${redactUrl(databaseUrl)}`);
  const childEnv = { ...inputEnv, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl };
  return exec(cmd, args, { stdio: 'inherit', cwd, env: childEnv, shell: process.platform === 'win32' });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
