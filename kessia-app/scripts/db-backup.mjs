// ============================================================
// KESSIA — Sauvegarde de la base (cahier des charges §48)
//
//   node scripts/db-backup.mjs                → dump vers ./backups/
//   node scripts/db-backup.mjs --out /chemin  → dossier de sortie
//
// Utilise `pg_dump` (format custom, compressé) sur DATABASE_URL.
// La restauration se fait avec `pg_restore` — voir
// docs/operations/backup-recovery.md.
//
// ⚠️ Ce script produit une sauvegarde MANUELLE / ponctuelle.
// La sauvegarde automatique et la rétention sont gérées par
// l'hébergeur (Supabase : PITR + snapshots quotidiens).
// ============================================================

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Charge .env sans dépendance (DATABASE_URL uniquement).
function loadEnvVar(name) {
  if (process.env[name]) return process.env[name];
  for (const f of ['.env.local', '.env']) {
    const p = join(process.cwd(), f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?`, 'm'));
    if (m) return m[1].trim();
  }
  return undefined;
}

const url = loadEnvVar('DATABASE_URL');
if (!url) {
  console.error('DATABASE_URL absent. Chargez .env avant de lancer ce script.');
  process.exit(1);
}

const outIdx = process.argv.indexOf('--out');
const outDir = outIdx !== -1 ? process.argv[outIdx + 1] : join(process.cwd(), 'backups');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = join(outDir, `kessia-${stamp}.dump`);

console.log(`Sauvegarde → ${file}`);
try {
  execFileSync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', file, url], {
    stdio: 'inherit',
  });
  console.log('✅ Sauvegarde terminée.');
} catch (e) {
  console.error('❌ Échec de pg_dump. Est-il installé et dans le PATH ?');
  console.error(String(e.message ?? e));
  process.exit(1);
}
