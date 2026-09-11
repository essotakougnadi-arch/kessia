// ============================================================
// KESSIA — Réinitialise la BASE DE TEST ISOLÉE (E2E + intégration)
//
//   npm run db:test:reset
//
// Lit la connexion dans .env.test (jamais commité) ou dans la variable
// d'environnement E2E_DATABASE_URL. Refuse de tourner si cette URL est
// identique à celle de .env.local / .env (garde-fou anti-écrasement de
// la base de démo partagée). Puis :
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
// ============================================================

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function readEnvVar(file, name) {
  const p = join(process.cwd(), file);
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, 'utf8').match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?`, 'm'));
  return m ? m[1].trim() : undefined;
}

const testUrl =
  process.env.E2E_DATABASE_URL ||
  readEnvVar('.env.test', 'DATABASE_URL') ||
  readEnvVar('.env.test', 'E2E_DATABASE_URL');

if (!testUrl) {
  console.error(
    [
      'Aucune base de test configurée.',
      '',
      'Crée kessia-app/.env.test avec :',
      '  DATABASE_URL="postgresql://…/<une base DÉDIÉE aux tests>"',
      '',
      'Options : un projet/branche Supabase séparé, ou un Postgres local',
      '  docker run -d --name kessia-test -e POSTGRES_PASSWORD=kessia \\',
      '    -e POSTGRES_DB=kessia_test -p 5433:5432 postgres:16',
      '  DATABASE_URL="postgresql://postgres:kessia@localhost:5433/kessia_test"',
    ].join('\n'),
  );
  process.exit(1);
}

const demoUrl = readEnvVar('.env.local', 'DATABASE_URL') || readEnvVar('.env', 'DATABASE_URL');
if (demoUrl && demoUrl === testUrl) {
  console.error(
    'REFUS : la base de test est identique à la base de démo (.env.local).\n' +
      'db:test:reset ferait un --force-reset destructif sur la démo. Configure une base distincte.',
  );
  process.exit(1);
}

const shortUrl = testUrl.replace(/:\/\/[^@]+@/, '://***@');
console.log(`Base de test : ${shortUrl}`);

const env = { ...process.env, DATABASE_URL: testUrl };
const run = (args) =>
  execFileSync('npx', args, { stdio: 'inherit', env, shell: process.platform === 'win32' });

console.log('\n1/2 — prisma migrate reset --force');
run(['prisma', 'migrate', 'reset', '--force', '--skip-generate', '--skip-seed']);

console.log('\n2/2 — seed');
execFileSync('npx', ['tsx', 'prisma/seed.ts'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

console.log('\nBase de test prête.');
