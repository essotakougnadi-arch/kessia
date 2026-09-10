# ADR 0044 — Base de test isolée pour les E2E locaux

**Statut :** accepté · **Date :** 2026-09-09

## Contexte

Deux suites E2E échouaient **par intermittence en local** :

- `support-attachments` : les pièces jointes s'empilaient sur un ticket
  du seed jusqu'au plafond `MAX_ATTACHMENTS_PER_TICKET` (10) → `400`.
- `marketplace-cart` : chaque run ajoutait un dépôt wallet ; l'historique
  finissait avec plusieurs lignes « Dépôt … » et `getByText(/Dépôt/i)`
  tombait en violation du mode strict Playwright.

Cause commune : `playwright.config.ts` avec `reuseExistingServer: !CI` +
exécution contre la **base de démo partagée** (`.env.local`). La CI, elle,
utilise un Postgres éphémère et n'a jamais eu le problème.

## Décision

### 1. Base dédiée, opt-in par fichier

- `.env.test` (gitignoré, `.env.test.example` fourni) porte le
  `DATABASE_URL` d'une base **dédiée** — branche/projet Supabase séparé
  ou Postgres local Docker.
- `npm run db:test:reset` (`scripts/db-test-reset.mjs`) :
  `prisma db push --force-reset` + seed sur cette base. **Refuse de
  tourner** si l'URL est identique à celle de `.env.local` (garde-fou
  anti-écrasement de la démo).
- `npm run test:e2e:isolated` = `db:test:reset` puis `playwright test`.

### 2. La config Playwright branche tout automatiquement

`playwright.config.ts` lit `.env.test` :

- injecte `DATABASE_URL` dans l'`env` du serveur qu'il démarre ;
- passe `reuseExistingServer: false` dès qu'une base de test existe —
  impossible de tester par erreur contre un `next dev` branché sur la
  démo.

Sans `.env.test`, comportement inchangé (`.env.local`, réutilisation du
serveur en local).

### 3. Tests d'intégration : même base, opt-in par variable

`test/integration/env-setup.ts` charge `.env.test` par-dessus quand
`USE_TEST_DB=1`. Le nettoyage `itest_` reste actif indépendamment.

### 4. Specs rendues indépendantes de l'état (ceinture + bretelles)

- `support-attachments` : chaque test **crée son propre ticket** via
  l'API au lieu de réutiliser un ticket du seed.
- `marketplace-cart` : `.first()` sur la confirmation de dépôt.

Ces deux specs passent donc même sur une base non réinitialisée.

## Conséquences

- Campagne E2E locale reproductible : `build` puis `test:e2e:isolated`.
- Aucune dépendance ajoutée (`scripts/*.mjs` en Node pur, comme
  `db-backup.mjs` ; pas de `dotenv-cli`/`cross-env`).
- CI inchangée (déjà isolée).
- `docs/development/testing.md` documente la topologie complète.

## Vérification

`tsc` + `lint` (0 warning) + `vitest` (178) + `build` OK. Les deux specs
retouchées passent contre la base de démo (état accumulé) et contre une
base fraîche.
