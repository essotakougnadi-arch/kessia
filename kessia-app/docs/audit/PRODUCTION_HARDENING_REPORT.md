---
title: "KESSIA — Rapport de durcissement production (Phase 0)"
date: "à partir du 11 septembre 2026"
---

# KESSIA — Rapport de durcissement production

Document vivant, mis à jour à la fin de chaque étape du plan de remédiation
Phase 0 (`docs/audit/PHASE0_EXECUTION_PLAN.md`), lui-même issu de l'audit du
2026-09-10 (`docs/audit/production-readiness-2026-09-10.md`).

Une section par étape : problème → modification → fichiers → tests →
résultat → risques résiduels → commit.

---

## P0.0 — Migrations Prisma versionnées

**Statut : FAIT.**

### Problème (audit, item #32 / P1.8 du plan)

Aucun `prisma/migrations/`. `prisma db push` utilisé partout (local, CI,
base de test) — pas d'historique versionné, pas de revue de diff, pas de
rollback documenté, risque de dérive silencieuse entre `schema.prisma` et
l'état réel d'une base partagée.

**Remonté en prérequis P0.0** (au lieu de P1.8 dans l'audit d'origine) :
P0.2 (sessions) et P0.4 (idempotence marketplace) ajoutent des colonnes de
schéma ; les faire via `db push` aurait aggravé le problème avant même de le
corriger.

### Modification

- Baseline `prisma/migrations/0_init/migration.sql`, générée depuis le
  schéma actuel (`prisma migrate diff --from-empty --to-schema-datamodel`) —
  exclusivement `CREATE TYPE`/`CREATE TABLE`/`CREATE INDEX`/`ALTER TABLE …
  ADD CONSTRAINT`, aucune instruction destructive, aucune donnée touchée.
- `prisma/migrations/migration_lock.toml` (provider `postgresql`).
- CI : `.github/workflows/integration.yml` et `e2e.yml` — `prisma db push
  --skip-generate` → `prisma migrate deploy`.
- Base de test isolée : `scripts/db-test-reset.mjs` — `prisma db push
  --force-reset` → `prisma migrate reset --force` (garde-fou anti-démo
  inchangé).
- Nouveau script `db:migrate:deploy` (`prisma migrate deploy`).
- Documentation : `README.md`, `docs/development/testing.md` mis à jour ;
  nouveau `docs/audit/DATABASE_MIGRATION_PLAN.md` (procédure complète de
  création de migration, application, baselining de la base de démo,
  migrations destructives, rollback) ; ADR
  `docs/decisions/0048-migrations-prisma-versionnees.md`.

### Fichiers modifiés/créés

```
prisma/migrations/migration_lock.toml                (nouveau)
prisma/migrations/0_init/migration.sql                (nouveau)
.github/workflows/integration.yml                     (modifié)
.github/workflows/e2e.yml                              (modifié)
scripts/db-test-reset.mjs                              (modifié)
package.json                                           (modifié — +1 script)
README.md                                              (modifié)
docs/development/testing.md                            (modifié)
docs/audit/DATABASE_MIGRATION_PLAN.md                  (nouveau)
docs/decisions/0048-migrations-prisma-versionnees.md   (nouveau)
```

### Dépendances / ce qui en découle

- P0.2 et P0.4 devront désormais créer leurs colonnes via
  `prisma migrate dev --name …` et committer la migration résultante,
  jamais via `db push`.
- La base de démo partagée reste, à ce stade, **non baselinée** — c'est une
  opération sur une base réelle nécessitant les identifiants de production ;
  procédure documentée dans `DATABASE_MIGRATION_PLAN.md` §4, à exécuter par
  l'opérateur avant la première migration réelle de schéma (P0.2).

### Risques de régression et mitigations

- **Baseline incorrecte par rapport à la base de démo réelle** → mitigé par
  la procédure `migrate diff --from-url … --to-schema-datamodel` (§4 du plan
  de migration), qui doit renvoyer un diff vide avant tout `resolve`.
- **CI cassée si `migrate deploy` échoue sur base neuve** → validé par
  l'exécution des workflows `integration.yml`/`e2e.yml` sur push (Postgres
  éphémère, base neuve à chaque run — voir résultats ci-dessous).
- **`db:test:reset` cassé** (E2E locaux) → `migrate reset --force` remplace
  `db push --force-reset` avec le même garde-fou anti-écrasement de la
  démo ; comportement fonctionnel identique (schéma neuf + seed), validé par
  la CI E2E qui exerce le même chemin.
- **Aucune donnée existante supprimée** : aucune commande destructive n'a été
  exécutée contre une base contenant des données réelles.

### Tests exécutés

- `npx prisma validate` — schéma valide.
- `npx prisma migrate diff --from-empty --to-schema-datamodel` — génération
  sans erreur, SQL relu (44 `CREATE TABLE`, 45 `CREATE TYPE`, 68 index, 57
  contraintes de clé étrangère — cohérent avec les 44 modèles / 45 enums du
  schéma).
- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run --root .`
- `npm run build`
- CI GitHub Actions (`integration.yml`, `e2e.yml`) déclenchée par le push —
  validation réelle de `prisma migrate deploy` sur Postgres éphémère neuf.

*(Résultats détaillés : voir la synthèse de fin d'étape communiquée à
l'utilisateur, avec le hash de commit.)*

### Ce qui reste à faire (hors P0.0, plus tard dans le plan)

- Baseliner la base de démo réelle (opérateur, `DATABASE_MIGRATION_PLAN.md` §4).
- P1.7 : détection de dérive schéma↔migrations en CI, garde anti-`db push`
  dans les scripts de déploiement.
- P1.9 : appliquer `migrate deploy` dans le pipeline staging→prod une fois
  celui-ci en place.
