// Charge .env puis .env.local dans process.env AVANT que les modules
// applicatifs (Prisma, routes) ne soient importés par les tests.
// Pas de dépendance dotenv (comme scripts/db-backup.mjs).

import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(file: string) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const rawLine of fs.readFileSync(p, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    // On laisse Vitest fixer NODE_ENV (= "test") : évite les logs de requêtes Prisma.
    if (key === 'NODE_ENV') continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val; // .env.local (chargé après) l'emporte
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

// Le rate limiting est neutralisé pour la suite d'intégration (comme en E2E).
process.env.E2E_RATE_LIMIT_BYPASS = '1';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL introuvable — les tests d\'intégration ont besoin d\'une base (voir vitest.integration.config.ts).'
  );
}
