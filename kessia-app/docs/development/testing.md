# Topologie des tests — KESSIA

Trois niveaux, trois façons de traiter la base de données.

| Niveau | Commande | Base | Isolation |
|---|---|---|---|
| **Unitaire** | `npm test` | aucune | fonctions pures, aucun I/O |
| **Intégration** | `npm run test:integration` | `.env.local` (ou `.env.test` si `USE_TEST_DB=1`) | données jetables préfixées `itest_`, nettoyage en cascade (`test/integration/helpers.ts`) |
| **E2E** | `npm run test:e2e:isolated` | `.env.test` (dédiée) | `--force-reset` + seed avant chaque campagne |
| **E2E (CI)** | `.github/workflows/e2e.yml` | Postgres éphémère du runner | recréée à chaque exécution |

## Pourquoi une base de test isolée pour les E2E

Les E2E écrivent en base. Lancées en local contre la **base de démo
partagée** (`.env.local`), elles y accumulent des données run après run :

- `support-attachments` — pièces jointes empilées sur un ticket du seed
  jusqu'à `MAX_ATTACHMENTS_PER_TICKET` (10) → `400` ;
- `marketplace-cart` — dépôts wallet répétés → l'historique contient
  plusieurs lignes « Dépôt … » et un `getByText` non ancré tombe en
  violation du mode strict Playwright.

Les deux specs ont été rendues **indépendantes de l'état** (ticket créé à
la volée, sélecteur `.first()` sur la confirmation), mais la solution de
fond est une base dédiée que l'on réinitialise.

## Mise en place (une fois)

```bash
cp .env.test.example .env.test
# renseigner DATABASE_URL : projet/branche Supabase séparé, ou Postgres local
#   docker run -d --name kessia-test -e POSTGRES_PASSWORD=kessia \
#     -e POSTGRES_DB=kessia_test -p 5433:5432 postgres:16
```

`.env.test` est gitignoré. `npm run db:test:reset` **refuse** de tourner si
son `DATABASE_URL` est celui de `.env.local` (le reset serait destructif
sur la démo).

Depuis l'ADR 0048, `db:test:reset` rejoue `prisma/migrations/` via
`prisma migrate reset --force` (et non plus `db push --force-reset`) :
la base de test valide donc les mêmes migrations versionnées que la CI
et, à terme, la production.

## Boucle de travail

```bash
npm run build                 # les E2E tournent sur `next start`
npm run test:e2e:isolated     # db:test:reset (schéma + seed neufs) puis Playwright
```

- `playwright.config.ts` lit `.env.test`, injecte `DATABASE_URL` dans le
  serveur qu'il démarre, et met `reuseExistingServer: false` — impossible
  de tester par erreur contre un serveur branché sur la démo.
- Sans `.env.test`, tout retombe sur le comportement précédent
  (`.env.local`, `reuseExistingServer` en local).

## Tests d'intégration sur la base isolée (optionnel)

```bash
USE_TEST_DB=1 npm run test:integration   # charge .env.test par-dessus .env.local
```

Utile pour rejouer une suite lourde (`platform.itest.ts`) sans toucher la
démo. Le nettoyage `itest_` reste actif de toute façon.
