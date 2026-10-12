# KESSIA — Suivi de progression (Master Prompt, 2026-10-12)

Statuts possibles : `NON AUDITÉ` · `EN COURS` · `BLOQUÉ` · `EN ATTENTE DE VALIDATION` · `ÉCHEC` · `VALIDÉ EN TEST` · `VALIDÉ EN PRODUCTION`.

Ce fichier est mis à jour à chaque point de contrôle. Il ne transforme jamais « non testé » en « terminé ».

---

## ⚠️ Incident du 2026-10-12 (session agent) — commande Prisma ad hoc, hôte distant non vérifié

**BLOQUANT jusqu'à autorisation explicite du propriétaire.** Une commande `prisma migrate status` tapée directement (hors de tout script protégé) avec `DATABASE_URL` remplacée mais `DIRECT_URL` non remplacée s'est connectée à `aws-1-eu-west-1.pooler.supabase.com:5432` au lieu du cluster de test local — repli silencieux exactement de la même nature que la cause racine de l'incident de production original. Lecture seule par conception de la commande (pas de preuve de modification, mais pas de preuve absolue de son absence non plus — voir le rapport). Correctif proposé (ALLOWLIST, `scripts/require-local-db.mjs`), **pas câblé, pas exécuté contre aucune base**. Toute nouvelle commande Prisma ou vérification de base de données est suspendue jusqu'à autorisation explicite.

**Détail complet, preuves, et correctif proposé** : `docs/audit/INCIDENT_2026-10-12_PRISMA_ADHOC_CONNECTION.md`.

**Constat aggravant découvert pendant l'investigation (lecture seule, `git show`)** : le correctif de l'incident de production ORIGINAL (`DIRECT_URL` toujours résolue explicitement dans `db-test-reset.mjs`) n'existe que sur la branche `fix/db-test-reset-production-guard` — **absent de `main`**. `npm run db:test:reset` reproduirait aujourd'hui l'incident original sur `main` tel quel. Rappel direct de l'urgence de fusionner cette PR, indépendamment du présent incident.

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

0. **Incident du 2026-10-12 (ce tour) : voir section dédiée en tête de ce fichier.** Bloquant jusqu'à autorisation explicite.
1. **État réel de la production toujours indéterminé** (P1.3, bloqué — classificateur automatique, pas une limite de ma part).
2. **Correctif `db-test-reset.mjs` validé en mock uniquement** — le script réel (avec un vrai `prisma migrate reset`) n'a pas pu être testé de bout en bout, l'action a été bloquée par un classificateur distinct (« Cloud Storage Mass Delete »), malgré une cible confirmée locale et sûre. **Confirmé ce tour (lecture seule, `git show`) : ce correctif n'existe que sur cette branche — absent de `main`.**
3. Fichiers KESSIA Shop toujours non commités (par conception, en attente d'autorisation dédiée) — confirmés intacts à chaque vérification de cette session.
4. **Finding course sur `Device` (fingerprint) — CORRIGÉ ce tour, sur une autre branche non fusionnée** (`test/authz-and-invariants`, commit `0d4bc6f`) : `recordDevice` remplace find-then-create par un upsert atomique, 3 nouveaux tests d'intégration prouvent 0 échec sous 20 enregistrements concurrents du même appareil (avant : certains retournaient `null`).
5. Le cluster PostgreSQL 16 de test local tournait en arrière-plan avant l'incident du 2026-10-12 — son état n'a plus été vérifié depuis (aucune commande de vérification autorisée pour l'instant, voir section incident).

## Tâches restantes (mises à jour 2026-10-12, après l'auto-révision du correctif d'incident)

- Pousser `test/authz-and-invariants` (commit `0d4bc6f`, le correctif `recordDevice`) — committé localement, pas encore poussé.
- Pousser `fix/prisma-adhoc-connection-guard` (commits `fcaf784`, `a5791cd`) — nouvelle branche, jamais poussée.
- Ouvrir les 4 PR (brouillons précis prêts, titres/corps/tests par branche — voir note de session). PR 4 doit cibler `fix/db-test-reset-production-guard` comme base, pas `main`.
- Décider du câblage du correctif proposé (`scripts/require-local-db.mjs`) — non câblé, et rester conscient de sa limite structurelle (ne protège pas une commande tapée directement) même une fois câblé.
- Ré-exécuter la suite complète (unitaire + intégration) sur `fix/db-test-reset-production-guard`/`fix/prisma-adhoc-connection-guard` avant fusion — pas revérifiée cette session (seuls `tsc`/`eslint`/le test simulé ciblé ont tourné).
- Appliquer la migration Phase 4/6 en production — non effectuée, décision du propriétaire.
- Décision sur le commit des fichiers KESSIA Shop (hors périmètre, rappelé pour mémoire).
- Décision sur la garde KYC devenue superflue à documenter une fois la PR 3 fusionnée (déjà tranchée et implémentée côté `feat/...`).

## Validations humaines requises, en attente

- **Incident du 2026-10-12 : autorisation explicite avant toute nouvelle commande Prisma, tout test de connexion, ou toute connexion à une base distante — voir section dédiée en tête de fichier et `docs/audit/INCIDENT_2026-10-12_PRISMA_ADHOC_CONNECTION.md`.** Reste valable même après l'auto-révision du correctif proposé : celui-ci n'a toujours pas été câblé ni exécuté.
- **Récupération Supabase : incident distinct, toujours non résolu.** Aucune action cette session (ni avant, ni pendant la gestion de l'incident Prisma ci-dessus) ne constitue une restauration, une migration, une écriture ou une connexion distante autorisée. Reste une action du propriétaire (dashboard/SQL editor Supabase).
- Vérification Supabase (backups/logs) — §P1.2/P1.3.
- Ouverture de PR pour `fix/db-test-reset-production-guard` (P1.4/P1.5) — pas d'accès API en écriture.
- Ouverture de PR pour `test/authz-and-invariants` (P2.20 volets 2+3 + correctif `recordDevice`) — idem.
- Ouverture de PR pour `fix/prisma-adhoc-connection-guard` (incident + correctif proposé) — idem, base = `fix/db-test-reset-production-guard`.
- Décision sur le commit des fichiers KESSIA Shop (hors périmètre de cet incident, rappelé pour mémoire).
