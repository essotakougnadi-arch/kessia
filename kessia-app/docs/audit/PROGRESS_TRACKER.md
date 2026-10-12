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
| P1.4 | Correctif empêchant la récidive (`db-test-reset.mjs`) | **VALIDÉ EN TEST** | — | `scripts/db-test-reset.mjs` corrigé, `scripts/db-test-reset.test.ts` (8 tests, dont la régression exacte de l'incident), `tsc`/`eslint` propres, suite complète 351/351. Commit `7d37f10`, branche `fix/db-test-reset-production-guard` poussée (PR non créée) | **EN ATTENTE DE VALIDATION** : ouverture de PR par le propriétaire (pas d'accès API en écriture GitHub) |

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
| Fichier `test/integration/authz.itest.ts` (6 nouveaux scénarios) | **ÉCRIT, NON EXÉCUTÉ** | `tsc`/`eslint` propres. **Jamais lancé contre une base réelle** — l'exécution a été interrompue par l'incident de production avant tout run. Statut réel : **EN ATTENTE DE VALIDATION** (ne pas confondre avec « terminé ») |
| 5 scénarios déjà couverts ailleurs (5,6,7,9,10) | **VALIDÉ EN PRODUCTION** (préexistant) | `admin-rbac.itest.ts`, `webhook-security.itest.ts`, `marketplace-order-idempotency.itest.ts`, `session-security.itest.ts` — déjà verts en CI avant l'incident |

## Phase 3 — Audit des modules KESSIA

**NON AUDITÉ** (pas commencé dans ce tour) — périmètre énorme (Wallet, Tontine, Marketplace, Business, KYC, RBAC, paiements, livraisons, notifications, back-office, feature flags, observabilité). À planifier module par module, pas en une seule passe.

## Phase 4 — KESSIA Verification (badge fournisseur)

**NON AUDITÉ**. Aucune recherche n'a encore été faite dans cette session sur l'état réel de cette fonctionnalité (existe-t-elle déjà, même partiellement ?). Première action nécessaire : audit de l'existant avant toute conception.

## Phase 5 — Marketplace et parcours de commande

| Sujet | Statut | Preuve |
|---|---|---|
| Seed annonçant 8 articles / API renvoyant une liste vide | **DÉJÀ INVESTIGUÉ ET RÉSOLU** (plus tôt dans cette session, avant l'incident) | Cause établie : absence de données réelles en production (pas un bug de code) → script contrôlé `scripts/init-production-kessia-seller.mjs` créé, **toujours non commité**, en attente d'autorisation séparée (préservé intact pendant tout l'incident) |
| Commit `0764c06…` (correctif enum `UserType.SME`) | **VÉRIFIÉ** — présent sur `origin/main` | SHA réel `0764c06a628a5876fddd9f56de0fddb40a6a1111` (le hash cité dans le master prompt comporte une coquille — un caractère manquant). `git merge-base --is-ancestor` confirme sa présence sur `main` |
| Idempotence commandes (`Idempotency-Key`, P0.4) | **VALIDÉ EN PRODUCTION** (préexistant) | `marketplace-order-idempotency.itest.ts`, exhaustif |
| Reste du parcours (panier, adresse ADR 0045, devis livraison, statuts) | **NON RÉAUDITÉ** dans ce tour | — |

## Phase 6 — Intégration KESSIA–MiaRide (livraison)

**NON AUDITÉ**. L'intégration Miaride EXISTE déjà partiellement dans le code (`lib/delivery/`, webhook `marketplace/deliveries/webhooks/miaride`, mode SIMULATED + HANDOFF, ADR 0042) — confirmé par du code lu cette session (`webhook-security.itest.ts`, `lib/delivery/index.ts`). **Mais** les exigences détaillées du Master Prompt (numéro de suivi généré par KESSIA et non Miaride, étiquette imprimable, preuve photo, étapes d'accord client-fournisseur) n'ont pas été comparées point par point à l'existant. Audit de conformité à faire avant toute implémentation.

## Phase 7 — Sécurité, finance, qualité

Largement recoupée par P2.20 (volets 1 et 2) déjà traités. Restent **NON AUDITÉS** : invariants comptables (`test/integration/invariants.itest.ts`, jamais écrit), fuzzing Zod (`fast-check`, jamais fait), DAST, pentest externe.

---

## Risques immédiats (au moment de la rédaction de ce tableau)

1. **État réel de la production toujours indéterminé** (P1.3, bloqué).
2. **Aucun test d'intégration (`*.itest.ts`) n'a tourné depuis l'incident** — y compris `authz.itest.ts`, nouvellement écrit. Ne pas relancer `db:test:reset` ni aucun test d'intégration tant qu'une base de test locale/isolée n'est pas positivement confirmée fonctionnelle (le correctif logiciel est prêt et testé en mock, mais le port `127.0.0.1:5433` n'a, à ma connaissance, jamais eu de serveur Postgres réellement en écoute sur cette machine).
3. Fichiers KESSIA Shop toujours non commités (par conception, en attente d'autorisation dédiée) — confirmés intacts à chaque vérification de cette session.

## Validations humaines requises, en attente

- Vérification Supabase (backups/logs) — §P1.2/P1.3.
- Ouverture de PR pour `fix/db-test-reset-production-guard` (P1.4) — pas d'accès API en écriture.
- Décision sur le commit des fichiers KESSIA Shop (hors périmètre de cet incident, rappelé pour mémoire).
- Autorisation de provisionner un vrai Postgres de test local (Docker ou autre) avant de relancer tout test d'intégration.
