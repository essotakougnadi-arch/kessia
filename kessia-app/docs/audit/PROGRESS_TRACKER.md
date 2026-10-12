# KESSIA — Suivi de progression (Master Prompt, 2026-10-12)

Statuts possibles : `NON AUDITÉ` · `EN COURS` · `BLOQUÉ` · `EN ATTENTE DE VALIDATION` · `ÉCHEC` · `VALIDÉ EN TEST` · `VALIDÉ EN PRODUCTION`.

Ce fichier est mis à jour à chaque point de contrôle. Il ne transforme jamais « non testé » en « terminé ».

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

**IMPLÉMENTÉ ce tour, suite aux règles métier fournies explicitement par le propriétaire** (statuts du dossier, dates, renouvellement, permissions, journal d'audit — cf. instruction verbatim). Les 4 questions ouvertes ci-dessous (conservées pour mémoire) ont été tranchées par les réponses reçues, pas par supposition :

1. Documents exacts : **non figés par juridiction** (conforme à « n'invente pas de documents légaux obligatoires propres à une juridiction ») — le propriétaire envoie un type parmi `BUSINESS_REGISTRATION`/`TAX_ID`/`OWNER_ID`/`PROOF_OF_ADDRESS`/`OTHER`, libellé libre, ≥1 document requis.
2. Approbation : rôle admin **existant** (`COMPLIANCE_ROLES`, `lib/auth/admin.ts`) — même garde que `/admin/kyc`, aucun nouveau rôle créé.
3. Expiration : **pas de durée par défaut codée en dur** — l'admin fixe `expiresAt` explicitement à l'approbation (ou le laisse vide = sans expiration) ; tick `expireOverdueSellerVerifications()` écrit mais **pas encore branché sur un cron** (disponible, non planifié).
4. Modèle : **nouveau modèle dédié** `SellerVerification`/`SellerVerificationDocument` (1-1 avec `Business`), en réutilisant la forme exacte de `KycCase`/`KycDocument` — pas de nouveau champ ajouté à `Business` lui-même.

| Élément | État |
|---|---|
| Schéma | `SellerVerification` (statuts `NOT_SUBMITTED/PENDING_REVIEW/APPROVED/REJECTED/EXPIRED`) + `SellerVerificationDocument`, migration additive pure appliquée **au cluster de test local uniquement** |
| Logique | `lib/marketplace/seller-verification.ts` : `submitSellerVerification` (contrôle automatique = complétude profil `phone`+`city`, seul contrôle auto implémenté — pas de vérif externe inventée), `reviewSellerVerification` (motif obligatoire si refus), `isSellerVerifiedBadgeActive`, `expireOverdueSellerVerifications` |
| Routes | `GET/POST /api/v1/business/[id]/verification` (propriétaire), `GET /api/v1/admin/seller-verifications` + `GET/PATCH /api/v1/admin/seller-verifications/[id]` (COMPLIANCE_ROLES) |
| Badge affiché | `sellerVerified` dans `serializeItem()` (catalogue + détail Marketplace), jamais vrai sans `APPROVED` + non expiré |
| Tests | `test/integration/seller-verification.itest.ts`, **11/11 verts** contre le cluster réel (soumission, permissions, cycle approbation/refus, badge, renouvellement après refus, audit, routes HTTP bout en bout) |
| Audit | `recordAudit({action:'seller_verification.submitted'\|'.approved'\|'.rejected', ...})` — fire-and-forget, comme le reste du code existant |

## Phase 5 — Marketplace et parcours de commande

| Sujet | Statut | Preuve |
|---|---|---|
| Seed annonçant 8 articles / API renvoyant une liste vide | **DÉJÀ INVESTIGUÉ ET RÉSOLU** (plus tôt dans cette session, avant l'incident) | Cause établie : absence de données réelles en production (pas un bug de code) → script contrôlé `scripts/init-production-kessia-seller.mjs` créé, **toujours non commité**, en attente d'autorisation séparée (préservé intact pendant tout l'incident) |
| Commit `0764c06…` (correctif enum `UserType.SME`) | **VÉRIFIÉ** — présent sur `origin/main` | SHA réel `0764c06a628a5876fddd9f56de0fddb40a6a1111` (le hash cité dans le master prompt comporte une coquille — un caractère manquant). `git merge-base --is-ancestor` confirme sa présence sur `main` |
| Idempotence commandes (`Idempotency-Key`, P0.4) | **VALIDÉ EN PRODUCTION** (préexistant) | `marketplace-order-idempotency.itest.ts`, exhaustif |
| Reste du parcours (panier, adresse ADR 0045, devis livraison, statuts) | **VALIDÉ EN TEST** (ce tour) | Voir Phase 3 — route de commande relue intégralement, panier confirmé client-only, livraison vérifiée par propriété + idempotente |

## Phase 6 — Intégration KESSIA–MiaRide (livraison)

**AUDITÉ puis IMPLÉMENTÉ ce tour**, suite aux règles métier fournies explicitement (numéro de suivi généré par KESSIA, étiquette posée par l'agent MiaRide, photo transmise par le fournisseur, collecte puis livraison, suivi consultable selon permissions). Les 3 écarts confirmés par l'audit initial (ci-dessous, conservés pour mémoire) sont désormais couverts — sauf l'étiquette imprimable physique, qui reste hors périmètre logiciel (voir note) :

| Exigence du master prompt | Écart constaté à l'audit | Traitement |
|---|---|---|
| Numéro de suivi **généré par KESSIA**, jamais par MiaRide | `providerRef` est le code **de MiaRide**, l'inverse de l'exigence | **Résolu sans toucher `providerRef`** (sens conservé, conforme à l'instruction explicite) : nouveau champ `kessiaTrackingCode String? @unique` (format `KSA-XXXXXXXX`, `generateTrackingCode()`, même alphabet que le code d'invitation tontine), généré par `requestDelivery()` pour les 3 chemins (planifié tontine, HANDOFF, SIMULATED) |
| Étiquette imprimable (code-barres/QR) | Aucun champ ni logique | **Hors périmètre logiciel pour cette version** — l'étiquette physique est posée par l'agent MiaRide sur le terrain ; KESSIA fournit le `kessiaTrackingCode` à imprimer/reporter dessus, pas un rendu code-barres/QR (non demandé explicitement, pas inventé) |
| Preuve photographique du colis étiqueté | Aucun champ de stockage photo | **Résolu** : `labelPhotoUrl`/`labelPhotoUploadedAt`/`labelPhotoUploadedById` sur `MarketplaceDelivery` + `uploadLabelPhoto()` (réservé au vendeur, idempotent — un nouveau dépôt remplace le précédent), action `label_photo` ajoutée à `POST /api/v1/marketplace/deliveries/[id]` (réutilise le validateur `imageDataUri` existant, exporté depuis `lib/validations/marketplace.ts`) ; notifie l'acheteur à réception |
| Suivi consultable par les parties autorisées | — | `kessiaTrackingCode`/`labelPhotoUrl`/`labelPhotoUploadedAt` ajoutés à `serialize()` de la route de livraison, déjà protégée par propriété (acheteur de la commande) — aucune nouvelle garde requise |

**Dépendance externe documentée (explicitement demandé)** : il n'existe **aucune intégration API MiaRide réelle** dans ce code. `lib/delivery/miaride.ts` est **entièrement simulé** (mode SIMULATED : statuts avancent seuls, coursier fictif ; mode HANDOFF : un lien `wa.me`/web est construit et l'acheteur commande lui-même sur Miaride, qui n'est pas appelé programmatiquement). Aucun identifiant d'API, webhook entrant MiaRide authentifié, ni contrat d'intégration n'a été trouvé dans le dépôt ou les variables d'environnement documentées (`MIARIDE_ENABLED`/`MIARIDE_DISPATCH_URL`/`MIARIDE_TRACKING_BASE` ne sont que des URLs de confort, pas des identifiants d'authentification). **Ceci reste vrai après ce tour** — le numéro de suivi KESSIA et la photo d'étiquette sont un dispositif interne à KESSIA ; leur transmission à un véritable système MiaRide nécessiterait un contrat d'API qui n'existe pas aujourd'hui.

| Élément | État |
|---|---|
| Tests | `test/integration/delivery-miaride.itest.ts`, **8/8 verts** contre le cluster réel (code unique par livraison, distinct de `providerRef`, généré en SIMULATED et HANDOFF ; `uploadLabelPhoto` réservé au vendeur, idempotent, refuse sur livraison terminée, NOT_FOUND propre) |
| Migration | Même migration additive que Phase 4 (même session), appliquée **au cluster de test local uniquement** |

## Phase 7 — Sécurité, finance, qualité

Largement recoupée par P2.20 (volets 1 et 2) déjà traités. Restent **NON AUDITÉS** : invariants comptables (`test/integration/invariants.itest.ts`, jamais écrit), fuzzing Zod (`fast-check`, jamais fait), DAST, pentest externe.

---

## Risques immédiats (mis à jour après exécution réelle)

1. **État réel de la production toujours indéterminé** (P1.3, bloqué — classificateur automatique, pas une limite de ma part). **Ceci reste distinct et non résolu par les validations ci-dessous, qui ne portent que sur la base de test locale.**
2. **Correctif `db-test-reset.mjs` validé en mock uniquement** — le script réel (avec un vrai `prisma migrate reset`) n'a pas pu être testé de bout en bout, l'action a été bloquée par un classificateur distinct (« Cloud Storage Mass Delete »), malgré une cible confirmée locale et sûre.
3. Fichiers KESSIA Shop toujours non commités (par conception, en attente d'autorisation dédiée) — confirmés intacts à chaque vérification de cette session.
4. **Finding mineur non bloquant** : course sur `Device` (fingerprint) en cas de transferts concurrents — voir tableau P2.20 volet 2.
5. Le cluster PostgreSQL 16 de test local tourne actuellement en arrière-plan (PID via `pg_ctl`, port 5433) — à arrêter proprement en fin de session.
6. **Migration `20261012163104_add_seller_verification_and_delivery_tracking` appliquée au cluster de test local uniquement** — jamais exécutée en production, conformément à la consigne (« aucune migration en production sans autorisation explicite »). `prisma migrate deploy` en production reste une action du propriétaire.
7. **3 branches poussées, aucune fusionnée** : `fix/db-test-reset-production-guard`, `test/authz-and-invariants`, `feat/seller-verification-and-miaride-tracking` (cette dernière contient Phase 4 + Phase 6 de ce tour). Aucune PR n'a été considérée comme fusionnée sans vérification — toutes restent à ouvrir/fusionner par le propriétaire.
8. `docs/audit/PROGRESS_TRACKER.md` existe en parallèle sur 2 branches non fusionnées (`fix/db-test-reset-production-guard` et, depuis ce tour, `feat/seller-verification-and-miaride-tracking`) — contenu base identique, sections Phase 4/6 ajoutées uniquement sur cette dernière. Fusion triviale attendue (ajouts en fin de section, pas de conflit de fond) mais à vérifier à la fusion des PR.

## Validations humaines requises, en attente

- Vérification Supabase (backups/logs) — §P1.2/P1.3.
- Ouverture de PR pour `fix/db-test-reset-production-guard` (P1.4/P1.5) — pas d'accès API en écriture.
- Ouverture de PR pour `test/authz-and-invariants` (P2.20 volets 2+3) — idem.
- **Ouverture de PR pour `feat/seller-verification-and-miaride-tracking`** (Phase 4 + Phase 6, ce tour) — idem, pas d'accès API en écriture.
- **Application de la migration en production** (`prisma migrate deploy` avec les variables d'environnement production) pour Phase 4/6 — non effectuée, décision du propriétaire.
- Décision sur le commit des fichiers KESSIA Shop (hors périmètre de cet incident, rappelé pour mémoire).
- Décision sur le finding `lib/fraud/devices.ts` (corriger maintenant ou plus tard — non urgent, non exploité par un attaquant, juste un log d'erreur bruyant).
- Décision sur la planification cron de `expireOverdueSellerVerifications()` (Phase 4) — fonction prête, non branchée.
