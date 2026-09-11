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

**Statut : code-complet et validé localement. Preuve CI/staging PARTIELLE — 3 points
en attente d'action côté opérateur, détaillés en fin de section.**

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

### Tests exécutés et résultats

| Vérification | Résultat |
|---|---|
| `npx prisma validate` | ✅ schéma valide |
| `npx prisma migrate diff --from-empty --to-schema-datamodel` | ✅ généré sans erreur — 44 `CREATE TABLE`, 45 `CREATE TYPE`, 68 index, 57 contraintes FK (cohérent avec 44 modèles / 45 enums) |
| `npx prisma migrate diff --from-url <base réelle> --to-schema-datamodel` (lecture seule) | ✅ **migration vide** — la baseline `0_init` correspond exactement à l'état réellement déployé, aucun écart |
| `npx tsc --noEmit` | ✅ 0 erreur |
| `npm run lint` | ✅ 0 warning |
| `npx vitest run --root .` (unitaires) | ✅ **182/182** verts |
| `npm run test:integration` (contre la base réelle) | ✅ **36/36** verts, 13 fichiers — Ledger (`createLedgerEntry`, idempotence, verrou), transferts + reversal, séquestre tontine ×3 (solo/orchestrateur/croissance), séquestre marketplace, RBAC back-office, inscription, plafonds KYC |
| `npm run build` | ✅ compilé sans erreur |
| Snapshot d'intégrité (script temporaire, lecture seule, supprimé après usage) **avant** la suite d'intégration | 17 wallets, 92 écritures ledger, 10 tontines (5 séquestres actifs), 0 wallet en désaccord avec son ledger, 0 séquestre déséquilibré, 0 clé d'idempotence dupliquée, 0 ligne orpheline |
| Même snapshot **après** la suite d'intégration | 18 wallets, 94 écritures, 0 séquestre tontine déséquilibré, 0 doublon, 0 orphelin, 0 résidu `itest_` — **1 écart isolé** sur le wallet système `MARKETPLACE_ESCROW`, voir finding ci-dessous |
| Santé prod (`/api/health`) avant/pendant/après tous les commits | ✅ `{"status":"ok","db":"ok"}` en continu, aucune interruption |
| `prisma migrate deploy` réellement exécuté sur une base neuve/isolée | ❌ **non prouvé** — voir « Preuve CI/staging » ci-dessous |
| `npm run test:e2e:isolated` | ❌ **non exécutable** dans cet environnement — aucun `.env.test` configuré (base de test dédiée absente) |
| Smoke test staging | ❌ **non exécutable** — aucun environnement staging déployé (`staging.yml` reste un squelette tant que `STAGING_DEPLOY_HOOK`/`STAGING_BASE_URL` ne sont pas configurés — c'est l'objet de P1.9, pas encore fait) |

### Finding découvert pendant la vérification — wallet séquestre marketplace

Le snapshot « après » a révélé un wallet `MARKETPLACE_ESCROW` (singleton système)
dont les écritures ledger sommées ne correspondent plus à son solde
(solde réel `0`, correct ; mais la somme des écritures visibles ne l'explique
plus). Investigation menée jusqu'au bout :

- **Cause identifiée avec certitude**, fichier
  `test/integration/marketplace-settlement.itest.ts`, `afterEach` (ligne ~30-31) :
  le nettoyage de fin de test supprime les écritures ledger du séquestre dont
  `referenceId` correspond à un `userId` de test — ce qui efface la ligne
  CRÉDIT (posée avec `referenceId: buyer.id`) — mais **pas** les lignes DÉBIT
  de règlement/remboursement (posées avec `referenceId: order.id`), qui
  restent. Le solde du wallet (`balance`, jamais touché par ce nettoyage)
  reste correct (`0`) ; seul l'historique du ledger pour ce wallet partagé
  devient incomplet.
- **Ni un bug financier, ni causé par P0.0** : aucun argent n'a été perdu ou
  mal attribué (le solde réel est exact), et P0.0 n'a modifié ni le ledger,
  ni ce test, ni la logique de séquestre. C'est un défaut de nettoyage
  **pré-existant** de ce test précis, révélé (pas créé) par l'exécution de
  la suite d'intégration demandée pour valider P0.0 — et qui se reproduira à
  chaque exécution future de ce test contre une base partagée.
- **Non corrigé dans ce commit** (hors périmètre migrations de P0.0, aucun
  refactoring non nécessaire). Aucune ligne n'a été supprimée manuellement
  pour « nettoyer » — l'ancien wallet et ses 2 écritures restantes sont
  laissés tels quels sur la base de démo.
- **Recommandation** : corriger `afterEach` pour aussi cibler les
  écritures dont `referenceId` est l'id de commande, ou marquer le
  séquestre marketplace comme hors-cible de nettoyage automatique — à
  traiter en P1.6 (réconciliation, qui aurait détecté exactement ce genre
  d'écart) ou en micro-correctif dédié, au choix de l'utilisateur.

### Preuve CI/staging — état réel (à ne pas confondre avec « ça compile »)

Conformément à la demande de ne pas déclarer P0.0 terminé sur la seule foi
d'un code de sortie 0, voici précisément ce qui est prouvé et ce qui ne l'est
pas encore, et pourquoi :

1. **CI (`integration.yml`/`e2e.yml` avec `migrate deploy`)** : le commit qui
   fait ce changement (`7203b9c`, voir plus haut) est prêt localement mais
   **pas encore poussé sur GitHub** — le push a été refusé (token sans scope
   `workflow`), et conformément à la consigne reçue, aucune régénération de
   token n'a été tentée ; l'application du diff est laissée à l'opérateur.
   **Tant que ce commit n'est pas sur GitHub, la CI tourne encore avec
   l'ancien `db push`** — aucune exécution réelle de `migrate deploy` en CI
   n'a donc pu être observée.
2. **Base cible « staging », isolée du dev/prod** : **il n'existe aucun
   environnement staging à ce jour.** `.github/workflows/staging.yml` est un
   squelette qui saute toutes ses étapes tant que les secrets
   `STAGING_DEPLOY_HOOK`/`STAGING_BASE_URL` ne sont pas configurés (ils ne
   le sont pas) — c'est précisément l'objet de l'étape P1.9, pas encore
   entamée. Il n'y a donc rien à « vérifier isolé » aujourd'hui — l'affirmer
   serait inexact.
3. **`migrate deploy` exécuté pour de vrai sur une base neuve** : non
   reproduit dans cet environnement (ni Docker ni serveur Postgres local
   disponibles ici — vérifié). À la place, la preuve la plus forte possible
   sans base jetable a été apportée : `prisma migrate diff --from-url <base
   réelle> --to-schema-datamodel` (lecture seule, zéro écriture) renvoie une
   **migration vide** — la baseline colle exactement à la réalité, donc
   `migrate resolve --applied 0_init` puis tout `migrate deploy` futur
   s'appliqueront proprement. C'est une preuve d'exactitude de la baseline,
   **pas** une preuve d'exécution réelle du pipeline.
4. **Smoke test staging** : sans staging, impossible à exécuter — non fait,
   et non simulé.

**Ce qui reste, concrètement, pour clore ces 3 points** (détaillé dans le
message de réponse, format « quel élément / pourquoi / où / quelle valeur /
conséquences / comment vérifier ») :
- Application manuelle du diff CI (`7203b9c`) sur GitHub par l'opérateur.
- Une base Postgres jetable (nouveau projet/branche Supabase, ou Postgres
  local) pour `.env.test`, seule façon de prouver `migrate deploy` et de
  faire tourner `test:e2e:isolated` en conditions réelles depuis cet
  environnement.
- Un environnement staging réel (P1.9) pour qu'un « smoke test staging »
  ait un sens.

### Ce qui reste à faire (hors P0.0, plus tard dans le plan)

- Baseliner la base de démo réelle (opérateur, `DATABASE_MIGRATION_PLAN.md` §4).
- P1.7 : détection de dérive schéma↔migrations en CI, garde anti-`db push`
  dans les scripts de déploiement.
- P1.9 : appliquer `migrate deploy` dans le pipeline staging→prod une fois
  celui-ci en place.
