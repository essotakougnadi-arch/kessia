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

**Statut : code-complet. B (base jetable) intégralement prouvé de bout en
bout. A (CI) et C (staging) restent bloqués — actions opérateur requises,
détaillées en fin de section. Verdict : P0.0 NON VALIDÉ — P0.1 BLOQUÉ.**

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
| `prisma migrate deploy` réellement exécuté sur une base neuve/isolée | ✅ **PROUVÉ** (mise à jour) — voir §B ci-dessous |
| `npm run test:e2e:isolated` | ✅ **PROUVÉ** (mise à jour) — voir §B ci-dessous |
| Smoke test staging | ❌ **non exécutable** — aucun environnement staging déployé (`staging.yml` reste un squelette tant que `STAGING_DEPLOY_HOOK`/`STAGING_BASE_URL` ne sont pas configurés — c'est l'objet de P1.9, pas encore fait). Voir §C. |

### B — Base de test jetable : PostgreSQL 16 local, isolé, prouvé de bout en bout

Aucune base jetable n'existant dans cet environnement, une instance
**PostgreSQL 16 locale a été installée** (`winget install PostgreSQL.PostgreSQL.16`,
service Windows créé mais **laissé inutilisé** — un cluster séparé a été créé
via `initdb` dans un répertoire temporaire, propriété de l'utilisateur
courant, aucun droit admin requis, port `5433` distinct du service). Base
`kessia_p0_test`, entièrement séparée de la base de démo/prod (hôte, port,
identifiants tous différents).

**Séquence exécutée, base propre à chaque fois :**

1. `createdb kessia_p0_test` → confirmé 0 table (`\dt`).
2. `DATABASE_URL=…5433/kessia_p0_test npx prisma migrate deploy` → **« All migrations
   have been successfully applied »**. `_prisma_migrations` : `0_init`,
   `applied_steps_count=1`, `rolled_back_at` NULL.
3. **Schéma vérifié** : 45 tables (44 + `_prisma_migrations`), ~45 enums, 113
   index, 57 contraintes FK — cohérent avec la baseline. `prisma migrate
   status` → « Database schema is up to date! ».
4. **Jeu de données représentatif** : `npm run db:seed` contre cette base →
   12 comptes, 10 tontines, 8 articles marketplace, Fonds de Garantie —
   **aucune erreur de contrainte/FK**, preuve de compatibilité schéma↔seed.
5. **Le script modifié par P0.0 lui-même** (`scripts/db-test-reset.mjs`,
   `.env.test` pointé sur cette instance) : `npm run db:test:reset` →
   `prisma migrate reset --force` + seed, **exécuté avec succès** — c'est la
   validation directe, en conditions réelles, du changement fait dans ce
   commit.
6. **`npm run test:e2e:isolated`** (49 tests, suite complète) exécutée
   **trois fois** contre cette base :
   - Run 1 : 48/49 verts (1 échec : login → 500).
   - Réexécution isolée du test en échec → **vert** (non reproductible).
   - Run 2 (reset complet) : 45/49 verts (4 échecs, tous sur le même
     schéma : `strict mode violation` — le sélecteur `getByText(nom)`
     matche à la fois l'élément de liste **et** un toast de confirmation
     qui contient le même texte en sous-chaîne).
   - Réexécution ciblée des 4 specs → même diagnostic confirmé par le
     message d'erreur exact (`Toaster_message` + élément de liste).
   - **Conclusion, avec preuve** : fragilité de test pré-existante (locator
     trop large face à un toast), **aucun rapport avec le schéma, la
     migration, ou une donnée financière** — jamais un échec côté Ledger,
     Wallet, Tontine, séquestre ou AuditLog sur 3 exécutions complètes. Non
     corrigé (hors périmètre P0.0) ; recommandé en test-hygiène séparée.
7. **Contrôle d'intégrité final** sur cette base, après les 3 exécutions
   complètes : 18 wallets, 117 écritures ledger, 15 tontines (6 séquestres),
   **0 wallet en désaccord, 0 séquestre déséquilibré, 0 clé d'idempotence
   dupliquée, 0 ligne orpheline**.
8. Instance arrêtée proprement (`pg_ctl stop -m fast`) en fin de validation ;
   données conservées sur disque (redémarrage : `pg_ctl -D <data> -o "-p 5433" start`).

**Décision à prendre** : garder cette installation PostgreSQL locale (utile
pour toute validation future de ce type, et pour faire tourner
`test:e2e:isolated` en local désormais) ou la désinstaller — à préciser.

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

### A — CI : toujours bloqué (inchangé)

Le commit qui bascule `integration.yml`/`e2e.yml` sur `migrate deploy`
(local, hash `48a65fc` au moment de la rédaction) reste **refusé au push**
par GitHub (token sans scope `workflow`). Retenté explicitement pendant
cette étape (`git push origin main`) → même refus. Conformément à la
consigne reçue, **aucune régénération/rotation de token n'a été tentée**.
Tant que ce diff n'est pas appliqué sur GitHub, la CI réelle tourne encore
avec `db push` — aucune exécution de `migrate deploy` en CI (GitHub
Actions) n'a pu être observée. Action requise : cf. réponse à l'utilisateur.

### C — Staging : impossible à réaliser depuis cet environnement

Vérifié explicitement pendant cette étape :
- **Aucun environnement staging n'existe.** `.github/workflows/staging.yml`
  saute toutes ses étapes sans les secrets `STAGING_DEPLOY_HOOK`/
  `STAGING_BASE_URL` (absents) — c'est l'objet de P1.9, non commencé.
- **Vercel CLI sans session active** (`vercel whoami` → « Logged out »,
  aucun token configuré dans cet environnement).
- Même avec un token, la création d'un projet Vercel / la configuration de
  variables d'environnement via API ne fait pas partie de ce que cet
  environnement peut faire pour ce type d'opération — seul le déclenchement
  d'un deploy hook déjà configuré par un humain serait possible.
- Provisionner un vrai staging (projet Vercel séparé, base Supabase séparée,
  secrets, déploiement) est un ensemble d'actions de configuration de
  compte/dashboard qui ne peut être fait que par l'opérateur.

**Conclusion** : C ne peut pas être démontré par cette session seule, dans
l'état actuel de l'infrastructure. Options détaillées dans la réponse à
l'utilisateur.

### Ce qui reste à faire (hors P0.0, plus tard dans le plan)

- Baseliner la base de démo réelle (opérateur, `DATABASE_MIGRATION_PLAN.md` §4).
- P1.7 : détection de dérive schéma↔migrations en CI, garde anti-`db push`
  dans les scripts de déploiement.
- P1.9 : appliquer `migrate deploy` dans le pipeline staging→prod une fois
  celui-ci en place.
