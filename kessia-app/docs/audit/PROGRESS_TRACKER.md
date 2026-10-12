# KESSIA — Suivi de progression (Master Prompt, 2026-10-12)

Statuts possibles : `NON AUDITÉ` · `EN COURS` · `BLOQUÉ` · `EN ATTENTE DE VALIDATION` · `ÉCHEC` · `VALIDÉ EN TEST` · `VALIDÉ EN PRODUCTION`.

Ce fichier est mis à jour à chaque point de contrôle. Il ne transforme jamais « non testé » en « terminé ».

---

## ⚠️ Incident du 2026-10-12 (session agent) — commande Prisma ad hoc, hôte distant non vérifié

**Toujours non résolu au sens strict — aucune commande Prisma réelle n'a été exécutée depuis, et aucune n'a été autorisée.** Une commande `prisma migrate status` tapée directement (hors de tout script protégé) avec `DATABASE_URL` remplacée mais `DIRECT_URL` non remplacée s'est connectée à `aws-1-eu-west-1.pooler.supabase.com:5432` au lieu du cluster de test local — repli silencieux exactement de la même nature que la cause racine de l'incident de production original. Lecture seule par conception de la commande (pas de preuve de modification, mais pas de preuve absolue de son absence non plus — voir le rapport).

**Détail complet, preuves** : `docs/audit/INCIDENT_2026-10-12_PRISMA_ADHOC_CONNECTION.md`.

**Correctif désormais câblé, mais toujours jamais exécuté contre aucune base** :
- `scripts/require-local-db.mjs` : garde ALLOWLIST (DATABASE_URL/DIRECT_URL identiques entre eux, identiques à `.env.test`, hôte loopback). **Auto-révisée** : sa description initiale sur-affirmait sa portée (« protège toute invocation ») — corrigée pour préciser qu'elle ne protège que ce qui l'appelle explicitement.
- `scripts/run-local-only.mjs` (nouveau ce tour) : relais concret, nouveau script npm `db:test:status` => `prisma migrate status` via ce relais. Comble le vide réel qui a motivé la commande ad hoc incriminée.
- **17 tests entièrement simulés** au total (`require-local-db.test.ts` 10 + `run-local-only.test.ts` 7) — `node:fs`/`execFileSync` moqués, **aucune commande réelle, aucune connexion, dans aucun de ces tests**.
- **Limite structurelle non résolue, et qui ne peut PAS être résolue par ce seul correctif** : même câblé, rien n'empêche une commande Prisma tapée directement dans un terminal de contourner `db:test:status` — exactement le mécanisme de l'incident lui-même. Documenté explicitement dans le rapport et l'en-tête des deux scripts.
- **La première exécution réelle de `db:test:status` (même contre le cluster local) n'a pas eu lieu et reste soumise à autorisation explicite du propriétaire.**

**Constat aggravant (lecture seule, `git show`)** : le correctif de l'incident de production ORIGINAL (`DIRECT_URL` toujours résolue explicitement dans `db-test-reset.mjs`) n'existe que sur la branche `fix/db-test-reset-production-guard` — **absent de `main`**. `npm run db:test:reset` reproduirait aujourd'hui l'incident original sur `main` tel quel.

**Délibérément NON fait** : `db-test-reset.mjs` lui-même n'a pas été modifié pour déléguer à `assertLocalTestPair()` — risquerait de casser son repli `E2E_DATABASE_URL` existant (8 tests déjà verts) sans bénéfice de sûreté démontré. Reporté comme nettoyage non urgent, pas un correctif de sûreté manquant.

---

## Phase 1 — Incident base de données (PRIORITÉ ABSOLUE)

| ID | Tâche | Statut | Dépendances | Preuves | Prochaine action |
|---|---|---|---|---|---|
| P1.1 | Établir la chronologie et la cause de l'incident (`DROP SCHEMA "public" CASCADE`) | **VALIDÉ EN TEST** (cause racine établie avec un haut degré de confiance) | — | Log Prisma (`Environment variables loaded from .env`), hôte/port identiques à `.env`, aucun `DROP SCHEMA` dans l'historique Git, 0 migration ne contient cette instruction | Aucune — close sauf nouvel élément |
| P1.2 | Recherche de sources de récupération (sauvegardes locales, dumps, artefacts CI, runbook) | **VALIDÉ EN TEST** (recherche exhaustive effectuée) | — | 2 rapports produits cette session ; aucune sauvegarde locale/CI trouvée ; runbook `docs/operations/backup-recovery.md` cite des snapshots quotidiens « plan de base », non vérifié indépendamment | Attendre réponse support Supabase + vérification dashboard par le propriétaire |
| P1.3 | Inventaire réel des tables/lignes en production | **BLOQUÉ** | Autorisation effective de lecture production | Tentative bloquée 2× par le classificateur automatique de l'environnement (« Production Reads », puis « Credential Materialization ») malgré l'autorisation du Master Prompt (§3.1) | Nécessite un réglage de permission côté propriétaire (hors de portée conversationnelle) — ou vérification directe par le propriétaire via le dashboard/SQL editor Supabase |
| P1.4 | Correctif empêchant la récidive (`db-test-reset.mjs`) | **VALIDÉ EN TEST** (garde elle-même prouvée en mock ; le script complet `db:test:reset` n'a PAS été ré-exécuté réellement — tentative bloquée par le classificateur automatique, « Cloud Storage Mass Delete » — la logique de garde est testée, pas le binaire `prisma migrate reset` lui-même sur ce chemin précis) | — | `scripts/db-test-reset.mjs` corrigé, `scripts/db-test-reset.test.ts` (8 tests, dont la régression exacte de l'incident), `tsc`/`eslint` propres. Commits `7d37f10` + `5c6b9a9`, branche `fix/db-test-reset-production-guard` poussée (PR non créée) | **EN ATTENTE DE VALIDATION** : ouverture de PR par le propriétaire (pas d'accès API en écriture GitHub) |
| P1.5 | Cluster PostgreSQL 16 de test local (port 5433, `kessia_p0_test`) retrouvé et redémarré | **VALIDÉ EN TEST** | Aucune (infra locale) | Trouvé arrêté (`postmaster.pid` périmé, PID confirmé non actif) dans le scratchpad de cette session — c'est la même instance que le P0.0 historique. Redémarré via `pg_ctl`, 45 tables confirmées, 4/4 migrations déjà appliquées (`_prisma_migrations`). **Important** : ce n'est pas le service Windows `postgresql-x64-16` (port 5432, délibérément inutilisé) | Penser à l'arrêter proprement (`pg_ctl stop -m fast`) en fin de session de travail |

## Phase 2 — Sécurisation des outils et de la CI/CD

| ID | Tâche | Statut | Preuves |
|---|---|---|---|
| P2.1 | Garde anti-production sur `db:push`/`db:migrate`/`db:migrate:deploy`/`db:studio`/`db:seed` | **VALIDÉ EN PRODUCTION** (préexistant, P1.9 Lot B) | `scripts/guard-db-command.mjs`, déjà prouvé en CI |
| P2.2 | Garde anti-production sur `db:test:reset` | **VALIDÉ EN TEST** (voir P1.4) | — |
| P2.3 | Postgres éphémère isolé en CI (integration.yml / e2e.yml) | **VALIDÉ EN PRODUCTION** (déjà en place, vérifié plusieurs fois cette session) | Services Postgres dédiés + garde anti-production par motif d'URL dans les deux workflows |
| P2.4 | Pipeline de sécurité CI (CodeQL, Gitleaks, npm audit) | **VALIDÉ EN PRODUCTION** | PR #4 fusionnée, 8/8 contrôles verts sur le commit de fusion `c9992ef` |
| P2.5 | Exclusions Gitleaks ciblées (6 faux positifs historiques) | **VALIDÉ EN PRODUCTION** | PR #5 fusionnée, `.gitleaksignore` sur `main` |

## Phase « P2.20 volet 2 » — Tests d'autorisation (11 scénarios du plan)

| ID | Statut | Détail |
|---|---|---|
| Fichier `test/integration/authz.itest.ts` (6 nouveaux scénarios) | **VALIDÉ EN TEST** (exécution réelle) | **7/7 tests verts** contre le cluster local réel (P1.5). `tsc`/`eslint` propres. Suite complète : 21 fichiers / 121 tests verts, aucune régression. Commit `d6a955c`, branche `test/authz-and-invariants` poussée (PR non créée) |
| 5 scénarios déjà couverts ailleurs (5,6,7,9,10) | **VALIDÉ EN PRODUCTION** (préexistant) | `admin-rbac.itest.ts`, `webhook-security.itest.ts`, `marketplace-order-idempotency.itest.ts`, `session-security.itest.ts` — déjà verts en CI avant l'incident |
| Finding mineur (non bloquant) découvert pendant l'exécution réelle | **ÉCHEC PARTIEL, non critique** | Scénario 8 (transferts concurrents) : `lib/fraud/devices.ts` lève une violation de contrainte unique `(userId, fingerprint)` lors de deux enregistrements d'appareil concurrents — erreur journalisée (`fraud_record_device_failed`), **absorbée, ne fait pas échouer la requête ni le transfert**. À corriger séparément (hors périmètre de ce tour), sans urgence |

## Phase « P2.20 volet 3 » — Invariants comptables (nouveau ce tour)

| ID | Statut | Détail |
|---|---|---|
| Fichier `test/integration/invariants.itest.ts` (nouveau) | **VALIDÉ EN TEST** (exécution réelle) | 7/7 tests verts : `balance == Σ(ledger)` par wallet utilisateur (après séquence de transferts + rejeu idempotent), séquestre de tontine remis exactement à 0 après restitution intégrale, séquestre Marketplace vérifié par **delta** (pas par solde absolu — voir constat ci-dessous), 0 solde négatif, 0 clé d'idempotence dupliquée, globalement sur toute la base. Commit `d6a955c` (même branche que authz.itest.ts) |
| **Constat d'audit Wallet/Ledger — écart MARKETPLACE_ESCROW, cause EXACTE identifiée et corrigée** | **RÉSOLU** | Cause racine isolée par mesure avant/après, fichier par fichier : `test/integration/marketplace-settlement.itest.ts` (seul responsable, confirmé) — son `afterEach` supprimait les écritures séquestre taguées `referenceId=userId` (`buyOnDelivery`, crédit entrant) mais jamais celles taguées `referenceId=orderId` (`releaseEscrowToSeller`/`refundEscrowToBuyer`, débit sortant, `lib/marketplace/escrow.ts:72,123`) — chaque run supprimait un crédit en laissant son débit jumeau, creusant l'écart de +650 000 à chaque exécution complète du fichier (mesuré, reproduit, confirmé). **Corrigé** (`orderIds` ajouté au filtre de nettoyage) — mesure après correctif : solde/somme-ledger/nombre de lignes **strictement identiques avant et après** une exécution complète (6/6 tests toujours verts). Aucune implication côté logique métier réelle — uniquement ce fichier de test, sur la base locale jetable. Le solde historique accumulé (~7,8M avant correctif) n'a pas été modifié manuellement (conforme à la consigne de ne jamais retoucher un solde) — il reste tel quel, artefact figé des runs passés, sans impact sur la correction (qui n'empêche que la récidive). Commit `24df5ba`, branche `test/authz-and-invariants` |

## Phase 3 — Audit des modules KESSIA

| Module | Statut | Détail |
|---|---|---|
| **Wallet/Ledger** | **VALIDÉ EN TEST** | Voir tableau ci-dessus (volet 3) : atomicité confirmée par lecture de code + données réelles, 0 anomalie restante après correctif |
| **Tontine** (orchestrateur, séquestre, cotisations) | **VALIDÉ EN TEST** (lecture de code + tests réels déjà existants, pas de nouveau test écrit ce tour) | `lib/tontine/orchestrator.ts` : activation verrouillée (`FOR UPDATE` + revérification, P1.7, prouvé par test) ; `checkAndAdvanceRound()` ne verse **jamais** plus que le séquestre détient (`held + 0.01 < pot` → suspension explicite, jamais de versement partiel) ; tous les versements idempotents (`TPAYOUT-<tontineId>-<round>`). `lib/tontine/escrow.ts` expose déjà `reconcileTontineEscrow()`/`escrowExpectedHeld()` — l'invariant séquestre est une fonction de bibliothèque réelle et testée, pas seulement un concept. `lib/tontine/contributions.ts::settleContribution` : idempotence par (membre, tour), double garde (route + ledger) |
| **Finding — tranché par la preuve, pas seulement par lecture de code** | **RÉSOLU, aucune correction nécessaire** | 2 nouveaux tests de concurrence réelle (2× puis 10× `Promise.all` sur `checkAndAdvanceRound()`, tour déjà complet) : **un seul versement réel, un seul avancement de tour**, dans les deux cas. L'hypothèse de l'audit (idempotence du ledger + convergence du calcul de tour) est confirmée par preuve, pas supposée. `test/integration/tontine-concurrency.itest.ts`, commit `826e3c7`, branche `test/authz-and-invariants`. 123/123 tests, suite complète |
| **Question produit non résolue (hors code)** | — | Membre qui quitte une tontine rotative active entre deux tours : comportement actuel = erreur explicite (« Bénéficiaire introuvable »), jamais un crash, mais aucun test dédié et aucune règle produit documentée sur ce cas |
| **Marketplace** (parcours, panier, paiement, idempotence, rapprochement, permissions, livraison, erreurs) | **VALIDÉ EN TEST** | `POST /marketplace/[id]/order` relu intégralement : idempotence par en-tête (clé stockée, rejeu renvoie la commande existante), verrou de stock sous transaction + remboursement symétrique si survente détectée après paiement, plafond KYC appliqué avant tout débit, mode TONTINE crée son plan solo atomiquement avec la commande (rollback conjoint). `describeBuyability()`/`installmentAmount()` : logique pure, déjà testée. Panier (`store/cartStore.ts`) : confirmé 100% client (localStorage), aucune route/modèle nouveau — enchaîne l'achat direct existant, conforme à sa propre documentation. Livraison (`lib/delivery/index.ts`) : `confirmDelivered`/`cancelDelivery`/`requestDelivery` tous vérifiés par propriété (`buyerId`), idempotents via la même clé ledger stable que le versement sous-jacent — **même schéma de sûreté que Tontine** (pas de verrou explicite au niveau fonction, mais le ledger sous-jacent absorbe la course, déjà prouvé par le test existant « vingt appels concurrents à confirmDelivered », vert) |

## Phase 4 — KESSIA Verification (badge fournisseur)

**AUDITÉ — fonctionnalité INEXISTANTE, confirmé par recherche exhaustive.** Aucune occurrence de « KESSIA Verification », aucun modèle Prisma, aucune route, aucune mention dans un ADR ou un document de conformité — la seule chose trouvée est une étiquette i18n générique `badgeKycVerified` (le badge KYC déjà existant pour les comptes individuels, pas un système de vérification fournisseur distinct). **Aucune décision métier préexistante à retrouver — il n'y en a pas.**

**Conformément à l'instruction du master prompt** (« si les critères exacts ne peuvent pas être retrouvés, implémente seulement ce qui est suffisamment défini et prépare une question précise ») — je ne conçois pas de modèle de données tant que ces points ne sont pas tranchés :
1. Quels documents/informations exacts prouvent qu'un fournisseur est « vérifié » (registre de commerce ? pièce d'identité du gérant ? numéro fiscal ? autre) ?
2. Qui approuve concrètement (un rôle admin existant — `COMPLIANCE`/`OPERATIONS` — ou un nouveau rôle dédié) ?
3. Le badge expire-t-il (durée fixe, renouvellement annuel) ou reste-t-il valide indéfiniment une fois accordé ?
4. Le modèle `Business`/`Supplier` déjà existant doit-il porter ce statut, ou un nouveau modèle dédié est-il préférable ?

Sans ces réponses, toute implémentation serait une invention de règles métier — explicitement proscrit.

## Phase 5 — Marketplace et parcours de commande

| Sujet | Statut | Preuve |
|---|---|---|
| Seed annonçant 8 articles / API renvoyant une liste vide | **DÉJÀ INVESTIGUÉ ET RÉSOLU** (plus tôt dans cette session, avant l'incident) | Cause établie : absence de données réelles en production (pas un bug de code) → script contrôlé `scripts/init-production-kessia-seller.mjs` créé, **toujours non commité**, en attente d'autorisation séparée (préservé intact pendant tout l'incident) |
| Commit `0764c06…` (correctif enum `UserType.SME`) | **VÉRIFIÉ** — présent sur `origin/main` | SHA réel `0764c06a628a5876fddd9f56de0fddb40a6a1111` (le hash cité dans le master prompt comporte une coquille — un caractère manquant). `git merge-base --is-ancestor` confirme sa présence sur `main` |
| Idempotence commandes (`Idempotency-Key`, P0.4) | **VALIDÉ EN PRODUCTION** (préexistant) | `marketplace-order-idempotency.itest.ts`, exhaustif |
| Reste du parcours (panier, adresse ADR 0045, devis livraison, statuts) | **VALIDÉ EN TEST** (ce tour) | Voir Phase 3 — route de commande relue intégralement, panier confirmé client-only, livraison vérifiée par propriété + idempotente |

## Phase 6 — Intégration KESSIA–MiaRide (livraison)

**AUDITÉ point par point contre `prisma.schema::MarketplaceDelivery`/`DeliveryStatus` — 3 écarts confirmés avec preuve, pas supposés :**

| Exigence du master prompt | État réel constaté | Écart |
|---|---|---|
| Numéro de suivi **généré par KESSIA**, jamais par MiaRide | Seul champ existant : `providerRef String? // code de suivi Miaride` — explicitement le code **de MiaRide**, l'inverse de l'exigence | **Écart confirmé** — aucun champ de suivi natif KESSIA n'existe |
| Étiquette imprimable (code-barres/QR) | Aucun champ ni logique de génération trouvés | **Écart confirmé** |
| Preuve photographique du colis étiqueté | Aucun champ de stockage de photo sur `MarketplaceDelivery` (`pickupLabel` est un texte décrivant le lieu d'enlèvement, pas une photo) | **Écart confirmé** |
| Étape d'accord client-fournisseur avant expédition | `DeliveryStatus` : `SCHEDULED→REQUESTED→COURIER_ASSIGNED→PICKED_UP→IN_TRANSIT→DELIVERED→CANCELLED` ; `sellerReadyAt` existe (vendeur prêt) mais aucun statut distinct de confirmation **acheteur** avant enlèvement | **À clarifier** — la commande+paiement existants jouent peut-être déjà ce rôle ; pas un écart certain, une question produit |
| Ce qui EXISTE déjà et fonctionne | `lib/delivery/index.ts` (`requestDelivery`/`confirmDelivered`/`cancelDelivery`), webhook signé+idempotent (`webhook-security.itest.ts`, déjà vert), modes SIMULATED/HANDOFF, séquestre lié à la livraison (ADR 0045) | Base solide, pas à refaire |

**Pas d'implémentation engagée** (nouveaux champs = migration de schéma, hors du périmètre « tâche ordinaire sans validation »). Question précise avant de concevoir le numéro de suivi KESSIA : format souhaité (ex. `KSA-XXXXXXXX`), et faut-il un QR code réellement scannable par un lecteur MiaRide, ou un simple code imprimé suffit pour cette phase ?

## Phase 7 — Sécurité, finance, qualité

Largement recoupée par P2.20 (volets 1 et 2) déjà traités. Restent **NON AUDITÉS** : invariants comptables (`test/integration/invariants.itest.ts`, jamais écrit), fuzzing Zod (`fast-check`, jamais fait), DAST, pentest externe.

---

## Risques immédiats (mis à jour après exécution réelle)

0. **Incident du 2026-10-12 : voir section dédiée en tête de ce fichier.** Le correctif est désormais câblé (`db:test:status`) et prouvé par 17 tests simulés, mais **jamais exécuté réellement, même contre le cluster local** — reste soumis à autorisation explicite.
1. **État réel de la production toujours indéterminé** (P1.3, bloqué — classificateur automatique, pas une limite de ma part).
2. **Correctif `db-test-reset.mjs` validé en mock uniquement** — le script réel n'a pas pu être testé de bout en bout. **Confirmé : ce correctif n'existe que sur cette branche — absent de `main`.**
3. Fichiers KESSIA Shop toujours non commités (par conception) — confirmés intacts à chaque vérification de cette session, y compris ce tour.
4. **Finding course sur `Device` (fingerprint) — CORRIGÉ, re-confirmé ce tour contre le cluster local réel** (`test/authz-and-invariants`, commit `0d4bc6f`, **désormais poussé**) : 126/126 tests d'intégration verts, dont les 3 nouveaux de `device-concurrency.itest.ts`.
5. Le cluster PostgreSQL 16 de test local a été **utilisé avec succès ce tour** (authz/invariants ré-exécutés, 126/126 verts) — toujours actif, à arrêter proprement en fin de session de travail.

## Validations locales terminées ce tour (2026-10-12, suite à l'incident — aucune commande Prisma, aucune connexion distante)

| Branche | Unitaires (tous mockés) | Intégration (cluster local réel) | `tsc`/`eslint` |
|---|---|---|---|
| `fix/db-test-reset-production-guard` | **351/351** (42 fichiers, re-confirmé ce tour) | non ré-exécutée ce tour (dernier statut connu : vert) | ✅ |
| `test/authz-and-invariants` | 343/343 (déjà confirmé) | **126/126** (22 fichiers, **re-exécuté réellement ce tour contre le cluster local**, autorisé explicitement) | ✅ |
| `feat/seller-verification-and-miaride-tracking` | 348/348 (déjà confirmé, inchangé ce tour) | 134/134 (déjà confirmé, inchangé ce tour) | ✅ |
| `fix/prisma-adhoc-connection-guard` | **368/368** (44 fichiers, re-confirmé ce tour avec les 17 nouveaux tests simulés) | sans objet (rien de nouveau ne touche une route/un service) | ✅ |

## Contrôles CI et conflits — vérifiés rigoureusement ce tour (`git merge-tree`, plumbing read-only, zéro branche/historique modifié)

**Bases ré-vérifiées par `git merge-base`** (pas supposées) : PR 1/2/3 partent toutes de `c9992ef` (tip réel d'`origin/main`). **PR 4 contient PR 1 comme ancêtre direct** (`git merge-base fix/db-test-reset-production-guard fix/prisma-adhoc-connection-guard` = tip exact de PR 1) — confirme la dépendance, pas juste un point de départ commun.

**Contrôles CI** (relu directement dans les 4 fichiers `.github/workflows/*.yml`, pas de mémoire) : `ci.yml`/`integration.yml`/`e2e.yml`/`security.yml` se déclenchent tous sur `pull_request: branches: [main, develop]`, rien d'autre. **PR 1/2/3 les déclenchent. PR 4, ouverte contre `fix/db-test-reset-production-guard`, n'en déclenche AUCUN** — compromis réel (diff propre sans CI, ou diff bruité avec CI contre `main`).

**Conflits — simulés réellement avec `git merge-tree --write-tree` (3 étapes chaînées via `git commit-tree`, aucun commit réel, aucune branche touchée, objets orphelins harmless laissés dans `.git/objects`)** :
1. `origin/main` + PR 1 → **propre**.
2. (résultat) + PR 4 → **propre** (confirme : PR 4 après PR 1 ne crée aucun nouveau conflit).
3. (résultat) + PR 3 → **`CONFLICT (add/add)` RÉEL et confirmé sur `kessia-app/docs/audit/PROGRESS_TRACKER.md`** ; `kessia-app/package.json` s'auto-fusionne proprement (confirmé, pas supposé) malgré que PR 3 et PR 4 le modifient toutes deux (sections différentes : devDependency `fast-check` vs script `db:test:status`).
4. (résultat de l'étape 1) + PR 2, indépendamment → **propre** (PR 2 ne touche ni le tracker ni `package.json`, fusionnable à tout moment sans égard à l'ordre des 3 autres).

**Ordre de fusion recommandé, maintenant vérifié et non plus seulement déduit : PR 1 → PR 4 → PR 2 (à tout moment) → PR 3**, avec réconciliation MANUELLE du contenu de `PROGRESS_TRACKER.md` au moment de fusionner PR 3 (seul conflit réel de tout le lot).

Détail complet par PR : voir les 4 brouillons de PR préparés cette session (titres, corps, tests, contrôles CI attendus, conflits).

## Migrations et schéma — vérifiés statiquement ce tour (`git show`, aucune commande Prisma, aucune connexion)

- **Seule `feat/seller-verification-and-miaride-tracking` touche `prisma/schema.prisma`/`prisma/migrations/`** — confirmé par diff de noms de fichiers sur les 4 branches contre `origin/main` : aucun conflit de schéma possible entre les 4 PR.
- Migration `20261012163104_add_seller_verification_and_delivery_tracking` relue intégralement : **purement additive** (2 `CREATE TYPE`, 1 `ALTER TABLE ADD COLUMN` ×4, 2 `CREATE TABLE`, 3 `CREATE INDEX`, 2 `ADD FOREIGN KEY`) — aucun `DROP`, aucune modification de type de colonne existante, aucune perte de données possible.
- Schéma ↔ migration cohérents (vérifié champ par champ) : l'index redondant sur `kessiaTrackingCode` corrigé plus tôt cette session reste bien absent (un seul `@unique`, pas de `@@index` séparé).
- `SellerVerificationDocument` n'indexe pas sa propre clé étrangère `verificationId` — **vérifié que c'est cohérent avec la convention existante** (`KycDocument.kycCaseId` non plus), pas un oubli introduit ce tour.
- 5 migrations au total sur cette branche, dans le bon ordre chronologique, `migration_lock.toml` inchangé (provider toujours `postgresql`).

## Publication GitHub — FAITE ce tour (autorisation explicite reçue)

Les 2 branches locales sont désormais poussées, confirmé par `git branch -vv` (plus aucun `ahead`, les 4 branches correspondent exactement à leur remote) :

| Branche | Avant | Après |
|---|---|---|
| `test/authz-and-invariants` | 1 commit local non poussé (`0d4bc6f`) | **poussée** — `826e3c7..0d4bc6f` (fast-forward, aucune réécriture) |
| `fix/prisma-adhoc-connection-guard` | jamais poussée (6 commits locaux) | **poussée pour la première fois** — nouvelle branche distante créée, upstream configuré |

Vérifié avant publication (pas supposé) : `git status`/`git remote -v` (1 seul remote, `origin`, le bon dépôt), commits locaux listés précisément et comparés au rapport précédent (exacts), aucun fichier préexistant touché. Push normal (jamais `--force`) — aucun historique réécrit, aucune branche réinitialisée.

**4 branches sur GitHub, aucune fusion.**

## État réel des PR sur GitHub — vérifié via l'API publique GitHub (lecture seule, pas `gh`, pas d'écriture)

**Une seule PR existe : PR #6.** Les 3 autres (correctif `DIRECT_URL`, tests authz/invariants, garde incident Prisma) **n'ont pas encore été ouvertes** — à ouvrir manuellement (pas d'accès API en écriture cette session).

| Champ | Valeur confirmée (API GitHub) |
|---|---|
| PR | #6, « Feat/seller verification and miaride tracking » |
| `base.ref` | `main` (correct) |
| `head.ref` / `head.sha` | `feat/seller-verification-and-miaride-tracking` / `dba47cf5…` (correspond exactement) |
| `mergeable_state` | **`clean`** — aucun conflit avec `main` **en ce moment précis**, confirmé indépendamment par ma propre simulation `git merge-tree` (PR seule contre `origin/main` actuel : propre) |
| Checks | **10/10, tous `success`** — 8 check-runs (CodeQL ×2, secrets-scan, dependency-audit, playwright, integration, verify, Vercel Preview Comments) + 2 statuts classiques (Vercel – kessia, Vercel – kessia-staging), tous confirmés via l'API `check-runs`/`status`. **Correspond exactement aux « 10 contrôles réussis » rapportés.** |
| Déploiement Vercel | Confirmé « Deployment has completed » sur les 2 contextes. |

**Problème réel trouvé, à corriger avant fusion** : la description de la PR #6 ne correspond pas à son contenu — elle décrit le correctif `DIRECT_URL`/`db-test-reset.mjs` (sujet de la future PR 1), pas la vérification fournisseur/MiaRide que cette PR contient réellement. Texte correct fourni au propriétaire pour remplacement manuel (pas d'accès d'écriture API pour le faire moi-même).

**Ordre de fusion — recomputé pour l'état réel (PR #6 prête, les 3 autres pas encore ouvertes), par nouvelle simulation `git merge-tree`** : fusionner PR #6 maintenant contre `main` actuel est **propre, confirmé**. Mais si elle fusionne AVANT que PR 1 soit ouverte/fusionnée, c'est alors **PR 1 (puis PR 4, qui en dépend)** qui hérite du conflit `PROGRESS_TRACKER.md` déjà identifié — **vérifié à nouveau dans ce sens précis, pas supposé symétrique**. Le conflit ne disparaît pas selon l'ordre, il change simplement de PR. Choix réel, pas un blocage : fusionner #6 maintenant (elle est prête, verte, déployée) et réconcilier le tracker à la fusion de PR 1/PR 4 ensuite ; ou attendre d'ouvrir PR 1/PR 4 et les fusionner avant #6 pour que le conflit tombe sur #6 à la place. PR 2 reste sans conflit dans tous les cas, à tout moment.

## Tentative de correction de PR #6 et d'ouverture des 3 PR manquantes — confirmé IMPOSSIBLE depuis cette session

Demandé explicitement ce tour. Vérifié avant de conclure (pas supposé par habitude) : aucune variable d'environnement `GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_PAT` présente, `gh` toujours introuvable. L'API publique GitHub permet la LECTURE sans authentification (utilisée pour vérifier PR #6) mais pas l'ÉCRITURE (créer une PR, modifier une description) sans token valide — absent. **Aucune tentative d'écriture n'a été faite** (pas de requête `POST`/`PATCH` envoyée) : la vérification s'est arrêtée à la détection de l'absence de token, par construction, pas par échec d'exécution.

**Texte de remplacement exact pour la description de PR #6** (à coller manuellement) :
> Implémente KESSIA Verification (badge « Fournisseur vérifié » : soumission de documents, revue admin COMPLIANCE_ROLES, expiration) et le suivi de livraison KESSIA–MiaRide (`kessiaTrackingCode` généré par KESSIA, distinct de `providerRef` ; preuve photo d'étiquette). Auto-audit inclus : index Prisma redondant supprimé, course de concurrence sur l'approbation corrigée (doublon notification/audit), 3 décisions produit tranchées explicitement par le propriétaire (garde KYC préservée, expiration badge 1 an par défaut, cron d'expiration branché). Migration additive pure, appliquée au cluster de test local uniquement. 348/348 unitaires, 134/134 intégration.

**Diffs réels re-confirmés ce tour (`git diff --name-status`, read-only) pour les 3 PR à ouvrir :**

| PR | Base | Fichiers (statut) |
|---|---|---|
| 1 — `fix/db-test-reset-production-guard` | `main` | `docs/audit/PROGRESS_TRACKER.md` (A), `scripts/db-test-reset.mjs` (M), `scripts/db-test-reset.test.ts` (A) — 3 fichiers, +365/-45 |
| 2 — `test/authz-and-invariants` | `main` | `lib/fraud/devices.ts` (M), `lib/observability/no-sensitive-console-log.test.ts` (M), `test/integration/{authz,device-concurrency,invariants}.itest.ts` (A×3), `test/integration/{marketplace-settlement,tontine-concurrency}.itest.ts` (M×2) — 7 fichiers, +746/-28 |
| 4 — `fix/prisma-adhoc-connection-guard` | **`fix/db-test-reset-production-guard` — base ré-vérifiée impérativement par `git merge-base` ce tour : son tip (`9b9cdaa`) EST l'ancêtre direct confirmé** | `docs/audit/INCIDENT_2026-10-12_PRISMA_ADHOC_CONNECTION.md` (A), `docs/audit/PROGRESS_TRACKER.md` (M), `package.json` (M), `scripts/require-local-db.mjs` (A), `scripts/require-local-db.test.ts` (A), `scripts/run-local-only.mjs` (A), `scripts/run-local-only.test.ts` (A) — 7 fichiers, +696/-9. **Ne contient plus `db-test-reset.mjs`/`.test.ts`** (déjà dans cette base) — confirme le bénéfice du bon choix de base. |

**PR #6 re-vérifiée au moment de ce rapport (API GitHub)** : `state=open`, `mergeable_state=clean`, `head.sha=dba47cf5…`, `commits=3`, `changed_files=23` — inchangée depuis la vérification précédente.

**Workflows CI re-confirmés une 3ᵉ fois (lecture directe des 4 fichiers `.yml`)** : `ci.yml`/`integration.yml`/`e2e.yml`/`security.yml` déclenchent uniquement sur `pull_request: branches: [main, develop]`. PR 1/2 (base `main`) les déclenchent. **PR 4 (base `fix/db-test-reset-production-guard`) n'en déclenche aucun** — confirmé, pas un oubli.

## Vérification finale consolidée (ce tour) — aucune régression, rien de nouveau à corriger

- **GitHub re-vérifié (API, lecture)** : toujours exactement 6 PR dans l'historique du dépôt, **une seule ouverte (#6)**, inchangée (`state=open`, `mergeable_state=clean`, 23 fichiers). Aucune des 3 autres n'a été ouverte depuis le dernier rapport.
- **Jeton d'écriture GitHub re-vérifié, absent** : pas de `GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_PAT`, pas de `gh`. Un credential Git (`credential.helper=manager`) existe et sert les `git push` de cette session, mais son périmètre réel (git uniquement, ou aussi l'API REST) n'est pas connu — **décision délibérée de ne pas le détourner vers des appels API d'écriture sans confirmation explicite que c'est voulu**, plutôt qu'une tentative aveugle.
- **Suites unitaires ré-exécutées réellement sur les 4 branches ce tour** (pas citées de mémoire) : `fix/prisma-adhoc-connection-guard` 368/368 (44 fichiers) · `fix/db-test-reset-production-guard` 351/351 (42) · `test/authz-and-invariants` 343/343 (41) · `feat/seller-verification-and-miaride-tracking` 348/348 (42) + `tsc` propre. **Aucune régression.**
- **Intégration** : non ré-exécutée ce tour (déjà vérifiée réellement contre le cluster local plus tôt dans cette même session — 126/126 sur `test/authz-and-invariants`, 134/134 sur `feat/...` — aucun code de test n'a changé depuis, re-citée sans ré-exécution inutile, conformément à la demande d'arrêter les vérifications répétitives).
- **Rien de documentaire ou technique « sans risque » restait à corriger** — tout ce qui avait été trouvé (index redondant, course de concurrence, sur-affirmation du correctif, course `recordDevice`) est déjà corrigé et commité sur la branche concernée.

## Blocages réels (pas des tâches, des faits qui ne dépendent pas de moi)

1. **Aucun accès en écriture à GitHub** — je ne peux pas corriger PR #6 ni ouvrir les 3 autres. Liens/textes exacts fournis au propriétaire.
2. **Récupération Supabase : incident distinct, toujours non résolu, ni confirmé récupéré ni confirmé perdu définitivement.** Action directe du propriétaire requise.
3. Décision du propriétaire sur l'ordre de fusion réel (PR #6 prête maintenant ; conflit `PROGRESS_TRACKER.md` confirmé entre {PR1+PR4} et PR3, quel que soit l'ordre).
4. Décision sur le commit des fichiers KESSIA Shop (hors périmètre).

## Prochaine action la plus efficace

**Corriger la description de PR #6 et ouvrir les 3 PR manquantes (textes/liens déjà prêts)** — c'est la seule étape qui débloque tout le reste (fusion, CI réel sur les 3 nouvelles PR, réconciliation du tracker) et qui ne peut être faite que par le propriétaire.
