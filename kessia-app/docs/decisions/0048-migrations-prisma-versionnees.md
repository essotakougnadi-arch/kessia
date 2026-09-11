# ADR 0048 — Migrations Prisma versionnées (fin de `db push` en CI/CD)

**Statut :** accepté · **Date :** 2026-09-11
**Contexte :** Phase 0 « Production Hardening » — remédiation P0.0, suite à
l'audit de préparation à la production du 2026-09-10
(`docs/audit/production-readiness-2026-09-10.md`, action prioritaire #6 /
item P1.8 du plan de remédiation, remonté en prérequis **P0.0** car P0.2 et
P0.4 ajouteront des colonnes de schéma).

## Contexte

KESSIA n'avait **aucun historique de migrations** : `prisma/migrations/`
n'existait pas, et `prisma db push` était utilisé partout où le schéma devait
être synchronisé — en local (README), en CI (`integration.yml`, `e2e.yml`) et
pour la base de test isolée (`scripts/db-test-reset.mjs`, ADR 0044).

`db push` dérive le DDL du schéma courant à la volée : pas d'historique versionné,
pas de revue de diff avant application, pas de rollback documenté, et un risque
réel de divergence silencieuse entre ce que `schema.prisma` décrit et ce qui est
réellement appliqué sur une base partagée (démo, à terme staging/prod). C'était
le finding **NOT READY** #32 de l'audit.

## Décision

### 1. Baseline versionnée, générée depuis le schéma actuel

`prisma/migrations/0_init/migration.sql` = `CREATE TYPE`/`CREATE TABLE`/
`CREATE INDEX`/`ALTER TABLE … ADD CONSTRAINT` uniquement (généré par
`prisma migrate diff --from-empty --to-schema-datamodel`, aucune instruction
destructive), reflétant l'état exact du schéma au commit `dc19323` (44 modèles,
45 enums). `prisma/migrations/migration_lock.toml` fixe le provider
(`postgresql`).

Cette baseline n'a **jamais été exécutée** contre une base existante (démo ou
future prod) — elle est conçue pour être **marquée comme déjà appliquée** via
`prisma migrate resolve --applied 0_init`, procédure détaillée dans
`docs/audit/DATABASE_MIGRATION_PLAN.md`. Sur une base neuve (CI, staging), elle
s'applique normalement via `prisma migrate deploy`.

### 2. CI : `db push` → `migrate deploy`

`.github/workflows/integration.yml` et `.github/workflows/e2e.yml` (Postgres
éphémère, base neuve à chaque run) appliquent désormais
`prisma migrate deploy` au lieu de `prisma db push --skip-generate`. Chaque
exécution CI valide donc que la baseline (et, plus tard, chaque nouvelle
migration) s'applique proprement depuis zéro.

`ci.yml` est inchangé (ne touche pas de base — `DATABASE_URL` factice, juste
`prisma generate` + build).

### 3. Base de test isolée : `db push --force-reset` → `migrate reset --force`

`scripts/db-test-reset.mjs` (ADR 0044) rejoue désormais l'historique de
migrations (`prisma migrate reset --force --skip-seed`, puis le seed comme
avant) au lieu de dériver le schéma à la volée. Le garde-fou existant (refus
si l'URL de test == URL de démo) est inchangé et reste la protection contre
un `--force` accidentel sur la base partagée.

### 4. `db push` conservé pour le prototypage local uniquement

Le script npm `db:push` reste disponible (`prisma db push`) pour itérer
rapidement sur une base **jetable** en développement, mais **ne doit plus
jamais être exécuté contre une base partagée** (démo/staging/prod) — le
README et `DATABASE_MIGRATION_PLAN.md` le documentent explicitement. Toute
évolution de schéma passe désormais par `prisma migrate dev --name <intitulé>`
(nouveau script `db:migrate`, inchangé) puis `db:migrate:deploy`
(= `prisma migrate deploy`, nouveau script) sur les bases partagées.

### 5. Ce que P0.0 ne fait PAS

- Pas de changement de schéma métier (aucun champ ajouté/retiré/renommé).
- Pas d'exécution de `migrate resolve` contre la base de démo/prod partagée
  depuis cet environnement — c'est une opération sur une base réelle,
  documentée comme procédure opérateur avec sauvegarde préalable dans
  `DATABASE_MIGRATION_PLAN.md`, pas automatisée ici.
- Pas de `directUrl` séparé dans `datasource db`. Le runtime applicatif
  (Vercel) est déjà sur le pooler transaction (port 6543, `pgbouncer=true`,
  ADR 0039) qui **ne supporte pas** le DDL de Prisma Migrate — c'est pour
  cette raison que `.env` (lu par le CLI Prisma) reste volontairement
  distinct de `.env.local` (lu par l'app) et pointe sur le pooler session
  (port 5432). Toute commande `prisma migrate …`/`db push` doit utiliser
  cette URL port 5432, jamais celle déployée sur Vercel — détaillé dans
  `DATABASE_MIGRATION_PLAN.md` §4. Formaliser un `directUrl` explicite est
  du ressort de P1.10 (pooling).

## Conséquences

- Toute future évolution de schéma (P0.2 : colonnes de révocation de
  session ; P0.4 : `idempotencyKey` marketplace ; etc.) devra être une
  migration nommée sous `prisma/migrations/`, revue avant merge, jamais un
  `db push` sur une base partagée.
- La CI valide à chaque run que l'historique de migrations s'applique
  proprement depuis zéro (détecte une migration cassée avant qu'elle
  n'atteigne une base réelle).
- La base de démo partagée reste, pour l'instant, en dérive tant que la
  procédure de baselining (`DATABASE_MIGRATION_PLAN.md`) n'a pas été exécutée
  dessus — c'est un prérequis explicite avant toute migration P0.2/P0.4.
- Aucune fonctionnalité, aucun test existant, aucune donnée modifiée.

## Vérification

`tsc` + `lint` + `vitest` (unitaires) + `npm run build` : voir rapport de
remédiation `docs/audit/PRODUCTION_HARDENING_REPORT.md` §P0.0. `migrate deploy`
sur base neuve validé par `.github/workflows/integration.yml` et `e2e.yml`
(CI) — le baselining réel de la base de démo est une étape opérateur
documentée dans `docs/audit/DATABASE_MIGRATION_PLAN.md`, non exécutée ici.
