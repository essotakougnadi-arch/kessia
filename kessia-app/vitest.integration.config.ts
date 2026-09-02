import { defineConfig } from 'vitest/config';
import path from 'node:path';

// ============================================================
// KESSIA — Tests d'intégration (§49)
//
// Ces tests exercent les handlers de route et les services de
// domaine CONTRE UNE VRAIE BASE (ledger atomique, idempotence,
// webhooks, plafonds KYC, cycle de tontine). Ils créent des
// données jetables préfixées `itest_` et les nettoient.
//
// ⚠️ Ne pas viser une base de production. Lancer :
//   npm run db:push && npm run db:seed   (base de dev/test)
//   npm run test:integration
// ============================================================

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['**/*.itest.ts'],
    exclude: ['node_modules', '.next', 'e2e'],
    setupFiles: ['./test/integration/env-setup.ts'],
    fileParallelism: false, // une seule base partagée
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
