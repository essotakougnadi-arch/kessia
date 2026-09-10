import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================
// KESSIA — Configuration Playwright (E2E, cahier des charges §49)
//
// ⚠️ Les tests E2E écrivent en base. Ils DOIVENT viser une base de
// test dédiée, jamais la prod ni la base de démo partagée.
//
// Local :  créer kessia-app/.env.test (DATABASE_URL = base dédiée)
//          npm run db:test:reset      (schéma neuf + seed)
//          npm run build && npm run test:e2e
//   → la config injecte automatiquement cette base dans le serveur
//     lancé pour les tests et force un serveur neuf (pas de réutilisation
//     d'un `next dev` branché sur la démo).
//
// CI : Postgres éphémère, voir .github/workflows/e2e.yml
// ============================================================

const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/** DATABASE_URL de la base de test isolée, si configurée (.env.test ou env). */
function testDatabaseUrl(): string | undefined {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const p = join(__dirname, '.env.test');
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, 'utf8').match(/^\s*(?:E2E_)?DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  return m ? m[1].trim() : undefined;
}

const TEST_DB = testDatabaseUrl();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
  },

  // KESSIA est mobile-first (§37) : viewport téléphone, la BottomNav est visible.
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],

  // Démarre le serveur si aucun n'est déjà là. Nécessite un build préalable
  // (`npm run build`). Pour cibler un serveur déjà lancé, définir E2E_BASE_URL.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: BASE_URL,
        timeout: 120_000,
        // Avec une base de test dédiée, on veut TOUJOURS un serveur neuf
        // branché dessus — jamais réutiliser un serveur pointé sur la démo.
        reuseExistingServer: TEST_DB ? false : !process.env.CI,
        env: {
          // La suite enchaîne les connexions depuis une seule IP.
          E2E_RATE_LIMIT_BYPASS: process.env.E2E_RATE_LIMIT_BYPASS ?? '1',
          ...(TEST_DB ? { DATABASE_URL: TEST_DB } : {}),
        },
      },
});
