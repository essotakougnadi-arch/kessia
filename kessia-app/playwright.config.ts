import { defineConfig, devices } from '@playwright/test';

// ============================================================
// KESSIA — Configuration Playwright (E2E, cahier des charges §49)
//
// ⚠️ Les tests E2E écrivent en base. Ils DOIVENT viser une base de
// test dédiée (Postgres local ou branche Supabase), jamais la prod.
// Lancer :  DATABASE_URL=<test>  npm run db:push && npm run db:seed
//           npm run build && npx playwright test
// En CI : voir .github/workflows/e2e.yml
// ============================================================

const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

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
        reuseExistingServer: !process.env.CI,
        env: {
          // La suite enchaîne les connexions depuis une seule IP.
          E2E_RATE_LIMIT_BYPASS: process.env.E2E_RATE_LIMIT_BYPASS ?? '1',
        },
      },
});
