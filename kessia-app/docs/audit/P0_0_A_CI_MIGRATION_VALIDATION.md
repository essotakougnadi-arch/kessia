---
title: "KESSIA — P0.0 / A : CI Migration Validation"
date: "11 septembre 2026"
---

# A — CI Migration Validation

**Objectif** : la CI doit démontrer, automatiquement et sur GitHub Actions
(pas seulement en local), que `prisma migrate deploy` fonctionne sur une
base isolée, qu'elle échoue immédiatement si une migration est invalide,
qu'elle ne touche jamais la production, et qu'elle n'expose aucun secret.

**Verdict : A = NON VALIDÉ.** Le mécanisme est construit, testé et prouvé
(positif + négatif) — mais **pas encore observable sur GitHub Actions**,
pour une seule raison, non liée au contenu de la CI : le token git de cet
environnement n'a pas le scope `workflow`, et GitHub refuse tout push
modifiant `.github/workflows/*.yml` sans ce scope. Détail en fin de
document.

---

## 1. Workflows CI identifiés

| Fichier | Rôle | Touchait `db push` ? |
|---|---|---|
| `.github/workflows/ci.yml` | lint/typecheck/unit/build (pas de vraie base) | non |
| `.github/workflows/integration.yml` | tests d'intégration, Postgres éphémère | **oui** → corrigé |
| `.github/workflows/e2e.yml` | Playwright, Postgres éphémère | **oui** → corrigé |
| `.github/workflows/cron.yml` | déclenche le tick horaire en prod | non (pas de DB directe) |
| `.github/workflows/staging.yml` | squelette de déploiement staging | non (sauté sans secrets, cf. rapport C) |

`scripts/db-test-reset.mjs` (hors CI, utilisé en local et par
`test:e2e:isolated`) utilisait aussi `db push --force-reset` → corrigé en
`migrate reset --force` dans le commit P0.0 initial (ADR 0048).

## 2. Modification appliquée

Dans `integration.yml` et `e2e.yml`, la séquence devient :

```yaml
- name: Garde anti-production — DATABASE_URL ne doit jamais être une base réelle
  run: |
    if echo "$DATABASE_URL" | grep -qiE "supabase\.co|pooler\.supabase\.com"; then
      echo "::error::DATABASE_URL pointe vers un hôte Supabase — refus d'exécuter une migration CI dessus."
      exit 1
    fi
    echo "OK — DATABASE_URL cible le Postgres éphémère du runner (localhost), pas une base réelle."

- name: Prisma generate
  run: npx prisma generate

- name: Prisma migrate deploy (base éphémère du runner, jamais la prod)
  run: npx prisma migrate deploy    # aucun continue-on-error, aucun `|| true`

- name: Vérifier l'état des migrations
  run: npx prisma migrate status

- name: Seed (jeu de données représentatif)
  run: npm run db:seed

- name: Tests dépendant de la base (Ledger, Wallet, Tontines, Marketplace, AuditLog…)
  run: npm run test:integration   # (ou test:e2e pour e2e.yml)
```

`db push` n'apparaît plus dans aucun des deux workflows. `DATABASE_URL` y
est une valeur factice pointant sur le service Postgres éphémère du job
(`postgresql://kessia:kessia@localhost:5432/kessia_itest`), déclarée en
clair dans le YAML — ce n'est pas un secret (identifiants jetables valides
uniquement le temps du job, sur un conteneur qui n'existe plus ensuite) ;
aucun secret GitHub réel n'est lu ni journalisé par ces steps.

## 3. Garde anti-production — testée

Testée unitairement en local avec 4 valeurs :

| URL testée | Résultat |
|---|---|
| `postgresql://kessia:kessia@localhost:5432/kessia_itest` (CI) | **AUTORISÉ** ✅ |
| `postgresql://postgres.uwvnarmojdbutbunzqww:***@aws-1-eu-west-1.pooler.supabase.com:5432/postgres` (prod, pooler session) | **BLOQUÉ** ✅ |
| `postgresql://postgres.uwvnarmojdbutbunzqww:***@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true` (prod, pooler transaction) | **BLOQUÉ** ✅ |
| `postgresql://postgres@127.0.0.1:5433/kessia_p0_test` (base jetable locale) | **AUTORISÉ** ✅ |

La garde ne journalise jamais la valeur de `DATABASE_URL` elle-même
(seul un message statique OK/erreur est imprimé) — aucun risque de fuite.

## 4. Test positif — `migrate deploy` réel sur base isolée

Exécuté (voir rapport B pour le détail complet) sur une instance PostgreSQL
16 **locale, isolée, jetable** (aucun Docker/Postgres disponible dans cet
environnement pour un run GitHub-Actions-like exact, donc reproduit avec la
même version majeure que le conteneur CI, `postgres:16`) :

- Base neuve → `prisma migrate deploy` → **« All migrations have been
  successfully applied »**.
- `prisma migrate status` → **« Database schema is up to date! »**.
- Schéma vérifié : 45 tables, ~45 enums, 113 index, 57 FK.
- `npm run test:integration` (39 tests au total sur la session) exécuté
  avec succès après un `migrate deploy` réel.

Le mécanisme (`prisma migrate deploy` + Postgres 16) est identique à celui
que la CI GitHub Actions invoquera — seul l'hébergeur du conteneur diffère
(ma machine vs runner GitHub), ce qui n'affecte pas le comportement de
Prisma/PostgreSQL.

## 5. Test négatif — migration invalide → échec immédiat

Reproduit avec une copie **isolée** du schéma (jamais le dépôt réel), une
base neuve dédiée, et une migration volontairement cassée :

```sql
-- prisma/migrations/9999_broken_migration_test/migration.sql
ALTER TABLE "this_table_does_not_exist" ADD COLUMN "x" INTEGER;
```

Résultat de `npx prisma migrate deploy` :

```
Applying migration `0_init`
Applying migration `9999_broken_migration_test`
Error: P3018

A migration failed to apply. New migrations cannot be applied before the error is recovered from.
Database error code: 42P01
Database error: ERROR: relation "this_table_does_not_exist" does not exist
```

**`EXIT CODE: 1`.**

`npx prisma migrate status` ensuite :

```
Following migration have failed:
9999_broken_migration_test
```

**`EXIT CODE: 1`** également.

**Conséquence en CI** : ni `migrate deploy` ni `migrate status` n'ont de
`continue-on-error: true` ni de `|| true` dans le YAML (vérifié à l'œil et
par relecture du diff) → un exit code non nul fait échouer le step, ce qui
fait échouer le job GitHub Actions immédiatement, avant les étapes
suivantes (seed, tests). C'est le comportement par défaut de GitHub
Actions, pas une configuration spécifique à ajouter.

Base et copie de schéma utilisées pour ce test négatif : supprimées après
usage — jamais commitées, jamais dans `prisma/migrations/` du dépôt réel.

## 6. Aucune donnée de production utilisée

- CI : `DATABASE_URL` pointe toujours sur `localhost` (service container),
  jamais sur un hôte Supabase — désormais **appliqué et vérifié par la
  garde anti-prod** (§3), pas seulement par convention.
- Tests locaux de cette étape (positif et négatif) : base PostgreSQL 16
  locale (`127.0.0.1:5433`), jamais la base de démo/prod (`.env`/
  `.env.local`, hôte Supabase).

## 7. Aucun secret exposé dans les logs

- `DATABASE_URL` de la CI n'est pas un secret réel (identifiants jetables
  d'un conteneur éphémère, déjà en clair dans le YAML avant ce changement).
- La garde anti-prod n'imprime jamais la valeur de l'URL, seulement un
  message fixe.
- `prisma migrate deploy`/`migrate status` impriment l'hôte/le nom de base
  (`Datasource "db": PostgreSQL database "…" at "…"`) mais **jamais
  l'utilisateur ni le mot de passe** — comportement natif de Prisma,
  vérifié sur chaque exécution de cette étape.
- Aucun secret GitHub (`JWT_SECRET`, etc.) n'est journalisé par ces steps.

## 8. État réel sur GitHub Actions — le seul point non prouvé

**Ce qui n'est pas encore observable** : un run réel sur GitHub Actions
montrant ces steps s'exécuter. Cause unique et déjà signalée à deux
reprises : le push du commit `.github/workflows/{integration,e2e}.yml`
est refusé par GitHub.

Ce n'est **pas un secret applicatif** (rien à configurer dans les coffres
GitHub/Vercel/Supabase) — c'est une restriction sur le **jeton d'accès Git
de cet environnement de développement** :

| Point | Détail |
|---|---|
| **Quoi** | Le PAT (Personal Access Token) utilisé par `git push` depuis cette machine/session n'a pas le scope OAuth `workflow` |
| **Pourquoi** | GitHub exige ce scope spécifique pour accepter tout push créant/modifiant un fichier sous `.github/workflows/` — protection anti-abus de la plateforme, indépendante du contenu du diff |
| **Où** | Git Credential Manager de ce poste (Windows), attaché au dépôt `essotakougnadi-arch/kessia` |
| **Valeur à changer** | Aucune valeur à transmettre dans le chat. Deux options, au choix : (a) éditer directement les 2 fichiers sur github.com (icône crayon, coller le contenu déjà généré, commit) — 2 min, aucun accès token nécessaire ; (b) régénérer le PAT local avec le scope `workflow` en plus de `repo` (explicitement mis en pause par consigne précédente) |
| **Conséquences si non fait** | La CI continue de fonctionner avec `db push` (aucun risque de service) — seule la preuve GitHub Actions de A reste manquante |
| **Comment vérifier, sans rien afficher** | `git fetch origin main && git log origin/main -- .github/workflows/integration.yml` doit montrer le commit avec `migrate deploy` ; je peux alors déclencher/lire un run réel et compléter ce rapport avec les logs GitHub Actions |

## 9. Fichiers concernés

```
.github/workflows/integration.yml   (modifié, prêt localement)
.github/workflows/e2e.yml            (modifié, prêt localement)
.github/workflows/staging.yml        (modifié — job migrate + fail-hard, cf. rapport C)
```

## 10. Checklist de validation complète (avant application/push)

Demandée avant application manuelle par l'utilisateur — exécutée intégralement :

| Vérification | Résultat |
|---|---|
| `git diff` relu (3 fichiers) | ✅ conforme au contenu présenté pour validation |
| `tsc --noEmit` | ✅ 0 erreur |
| `lint` | ✅ 0 warning |
| `vitest` (unitaires) | ✅ 182/182 |
| `test:integration` (base jetable, `USE_TEST_DB=1`) | ✅ 13 fichiers, 36/36 tests |
| `test:e2e:isolated` (base jetable, 49 tests) | ⚠️ voir §11 — un vrai bug découvert, sans rapport avec A/C |
| `npm run build` | ✅ compilé sans erreur |
| YAML des 3 fichiers (`js-yaml`) | ✅ syntaxe valide, jobs bien formés |
| `grep "npx prisma db push"` sur les 3 fichiers | ✅ 0 occurrence (seulement des commentaires explicatifs mentionnant l'ancien comportement) |
| `git push origin main` | ❌ refusé, même message que précédemment (scope `workflow`) — aucune régénération tentée |

## 11. Finding découvert pendant `test:e2e:isolated` — bug réel, hors périmètre A/C

En creusant des échecs E2E d'apparence aléatoire (login → 500, différents
comptes/spécs à chaque run), la cause a été **isolée et prouvée**, pas
supposée :

- **Reproduction directe** : 20 appels `POST /api/v1/auth/login` en
  rafale sur le même compte → 15/20 en `500`.
- **Cause exacte** (log serveur) : `Invalid prisma.session.create() invocation:
  Unique constraint failed on the fields: (token)`.
- **Explication** : `lib/auth/session.ts::createSession` stocke le JWT
  d'accès lui-même comme `Session.token` (`@unique` en base). `jwt.sign()`
  (librairie `jsonwebtoken`) est déterministe à `iat` égal (granularité
  à la seconde) — deux connexions du **même utilisateur dans la même
  seconde** produisent donc un JWT strictement identique, et la deuxième
  écriture en base viole la contrainte d'unicité → `500` non rattrapé.
- **Pourquoi ça n'apparaissait jamais avant** : contre la base de démo
  cloud (Supabase), la latence réseau (~100-500 ms/appel) espace
  naturellement les connexions au-delà d'une seconde. Ma base de test
  locale (B) répond en quelques millisecondes, ce qui a rendu la
  collision visible pour la première fois.
- **Hors périmètre de A/C** : aucun rapport avec les migrations, la CI ou
  le staging — c'est un défaut pré-existant de la logique de session
  (`lib/auth/session.ts`), probablement dans le champ naturel de **P0.2
  (Sessions/tokens)**. **Non corrigé ici**, conformément à la consigne de
  ne rien changer hors du périmètre A/C.
- **Distinct des échecs E2E déjà documentés** (`PRODUCTION_HARDENING_REPORT.md`,
  validation B) sur `strict mode violation` (toast vs élément de liste,
  fragilité de locator UI) — deux causes différentes, toutes deux
  pré-existantes et sans rapport avec le schéma/la migration/les données
  financières (Ledger/Wallet/séquestres inchangés et corrects sur tous
  les runs).

## 12. Commit

Commit local (non poussé) : `37b747d` (staging.yml, correction demandée)
sur `366eec1` (integration.yml/e2e.yml, contenu inchangé depuis la
présentation initiale — comparé et validé par l'utilisateur avant
application). Push tenté après validation complète ci-dessus : refusé,
identique à chaque tentative précédente.
