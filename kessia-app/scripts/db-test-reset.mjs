// ============================================================
// KESSIA — Réinitialise la BASE DE TEST ISOLÉE (E2E + intégration)
//
//   npm run db:test:reset
//
// Lit la connexion dans .env.test (jamais commité) ou dans la variable
// d'environnement E2E_DATABASE_URL. Refuse de tourner si cette URL est
// identique à celle de .env.local / .env (garde-fou anti-écrasement de
// la base de démo partagée), ou si elle correspond à une référence de
// projet Supabase de PRODUCTION connue. Puis :
//   1) prisma migrate reset --force   (rejoue prisma/migrations/ sur une base vidée)
//   2) prisma db seed                 (personas de démo)
//
// Pourquoi : deux suites E2E (support-attachments, marketplace-cart)
// accumulaient des données sur la base de démo partagée et devenaient
// intermittentes. Une base dédiée + reset avant run règle ça.
//
// `migrate reset` (et non `db push --force-reset`, ADR 0048) : rejoue
// l'historique versionné de prisma/migrations/ au lieu de dériver le
// schéma à la volée — la base de test valide ainsi les mêmes migrations
// que la CI et, à terme, la production.
// Voir docs/development/testing.md.
//
// ⚠️ INCIDENT 2026-10-12 : ce script a provoqué un `DROP SCHEMA "public"
// CASCADE` sur la base de PRODUCTION. Cause : il ne neutralisait que
// DATABASE_URL avant d'appeler Prisma, jamais DIRECT_URL. Or
// `prisma migrate reset` utilise DIRECT_URL (pas DATABASE_URL) pour la
// connexion du moteur de migration (prisma/schema.prisma déclare les
// deux, P1.11/ADR 0049) ; comme DIRECT_URL n'était jamais fournie
// explicitement, Prisma est retombé sur son propre chargement natif de
// `.env` — qui contient les identifiants de production. Correctif :
// DIRECT_URL est désormais TOUJOURS résolue et neutralisée explicitement
// (jamais laissée à la charge de Prisma), et les DEUX variables passent
// par le même garde-fou anti-production que db:push/db:migrate/db:seed
// (`guard-db-command.mjs::isProductionDatabaseUrl`) avant tout appel à
// une commande Prisma. Voir scripts/db-test-reset.test.ts (régression).
// ============================================================

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isProductionDatabaseUrl, redactUrl } from './guard-db-command.mjs';

export function readEnvVar(file, name, cwd = process.cwd()) {
  const p = join(cwd, file);
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, 'utf8').match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?`, 'm'));
  return m ? m[1].trim() : undefined;
}

/**
 * Résout et valide la base de test, puis exécute reset + seed contre elle.
 * `cwd`/`env`/`exit` injectables pour les tests (voir db-test-reset.test.ts).
 */
export function main({ cwd = process.cwd(), env: inputEnv = process.env, exit = process.exit } = {}) {
  const testDatabaseUrl =
    inputEnv.E2E_DATABASE_URL ||
    readEnvVar('.env.test', 'DATABASE_URL', cwd) ||
    readEnvVar('.env.test', 'E2E_DATABASE_URL', cwd);

  if (!testDatabaseUrl) {
    console.error(
      [
        'Aucune base de test configurée.',
        '',
        'Crée kessia-app/.env.test avec :',
        '  DATABASE_URL="postgresql://…/<une base DÉDIÉE aux tests>"',
        '  DIRECT_URL="postgresql://…/<la même base, ou sa connexion directe>"',
        '',
        'Options : un projet/branche Supabase séparé, ou un Postgres local',
        '  docker run -d --name kessia-test -e POSTGRES_PASSWORD=kessia \\',
        '    -e POSTGRES_DB=kessia_test -p 5433:5432 postgres:16',
        '  DATABASE_URL="postgresql://postgres:kessia@localhost:5433/kessia_test"',
      ].join('\n'),
    );
    return exit(1);
  }

  // INCIDENT 2026-10-12 — DIRECT_URL n'est JAMAIS laissée indéfinie : à
  // défaut d'une valeur dédiée dans .env.test, elle reprend explicitement
  // testDatabaseUrl (toujours une base de test déjà validée), jamais une
  // variable non définie que Prisma irait résoudre lui-même depuis .env.
  const testDirectUrl =
    inputEnv.E2E_DIRECT_URL || readEnvVar('.env.test', 'DIRECT_URL', cwd) || testDatabaseUrl;

  const demoDatabaseUrl = readEnvVar('.env.local', 'DATABASE_URL', cwd) || readEnvVar('.env', 'DATABASE_URL', cwd);
  const demoDirectUrl = readEnvVar('.env.local', 'DIRECT_URL', cwd) || readEnvVar('.env', 'DIRECT_URL', cwd);

  // Garde 1 (préexistante) : la base de test ne doit jamais être
  // identique à la base de démo/dev — pour DATABASE_URL ET DIRECT_URL.
  if (demoDatabaseUrl && demoDatabaseUrl === testDatabaseUrl) {
    console.error(
      'REFUS : la base de test (DATABASE_URL) est identique à la base de démo (.env/.env.local).\n' +
        'db:test:reset ferait un --force-reset destructif sur la démo. Configure une base distincte.',
    );
    return exit(1);
  }
  if (demoDirectUrl && demoDirectUrl === testDirectUrl) {
    console.error(
      'REFUS : la base de test (DIRECT_URL) est identique à la base de démo (.env/.env.local).\n' +
        'db:test:reset ferait un --force-reset destructif sur la démo. Configure une base distincte.',
    );
    return exit(1);
  }

  // Garde 2 (NOUVELLE, INCIDENT 2026-10-12) : ni DATABASE_URL ni DIRECT_URL
  // de la base de test ne doivent jamais correspondre à une référence de
  // projet Supabase de PRODUCTION connue — même garde-fou que
  // db:push/db:migrate/db:migrate:deploy/db:studio/db:seed.
  for (const [name, url] of [
    ['DATABASE_URL', testDatabaseUrl],
    ['DIRECT_URL', testDirectUrl],
  ]) {
    if (isProductionDatabaseUrl(url)) {
      console.error(
        `::error::REFUS — ${name} de la base de test correspond à une référence de projet Supabase de PRODUCTION connue.`,
      );
      console.error(`::error::Cible détectée : ${redactUrl(url)}`);
      console.error('::error::db:test:reset ferait un reset destructif sur la production. Corrige .env.test avant de continuer.');
      return exit(1);
    }
  }

  console.log(`Base de test (DATABASE_URL) : ${redactUrl(testDatabaseUrl)}`);
  console.log(`Base de test (DIRECT_URL)   : ${redactUrl(testDirectUrl)}`);

  // Les DEUX variables sont désormais TOUJOURS fournies explicitement à
  // Prisma — jamais de repli silencieux sur le .env du projet (cause
  // racine de l'incident du 2026-10-12).
  const childEnv = { ...inputEnv, DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDirectUrl };
  const run = (args) => execFileSync('npx', args, { stdio: 'inherit', cwd, env: childEnv, shell: process.platform === 'win32' });

  console.log('\n1/2 — prisma migrate reset --force');
  run(['prisma', 'migrate', 'reset', '--force', '--skip-generate', '--skip-seed']);

  console.log('\n2/2 — seed');
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], { stdio: 'inherit', cwd, env: childEnv, shell: process.platform === 'win32' });

  console.log('\nBase de test prête.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
