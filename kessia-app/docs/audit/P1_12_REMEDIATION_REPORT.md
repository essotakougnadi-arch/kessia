---
title: "KESSIA — P1.12 : Rate limiting distribué (Upstash) & garde fail-closed — Rapport"
date: "22 septembre 2026"
---

# KESSIA — P1.12 : Rate limiting distribué (Upstash) & garde fail-closed

**Base** : P1.7, P1.9 (Lot A + Lot B) validés. Plan présenté et validé
avant implémentation.

**⚠️ STATUT : implémenté, testé localement, COMMITÉ LOCALEMENT,
**NON POUSSÉ** vers `origin main`, NON DÉPLOYÉ.** Voir §6.

---

## 0. Cycle de validation Staging du 22 septembre 2026 — tentative

**Objectif** : valider `afd23ef` en environnement Staging réel avant tout
push vers `main`, Upstash Staging/Production ayant été configurés
manuellement par l'utilisateur dans les deux projets Vercel
(`kessia-staging`, `kessia`) entre-temps.

**Commit testé** : `afd23ef2779503350dcdb6a91f83f9043479940d` (inchangé
depuis sa création).

### Étape 1 — Inspection
`git status` propre (rien au-delà d'`afd23ef`) ; `main` toujours 1 commit
en avance sur `origin/main` (`5caaf2c`) ; `afd23ef` confirmé ne toucher
que 4 fichiers (`lib/security/rate-limit.ts`, son test, `CHANGELOG.md`,
ce rapport) — aucun workflow/fichier CI-CD. `staging.yml` reconfirmé :
`on: push: branches: [main]` + `workflow_dispatch`.

### Étape 2 — Variables Staging
**Non vérifiable directement** : aucun accès à l'API/dashboard Vercel ou
Upstash depuis cet environnement d'exécution. La configuration manuelle
déclarée par l'utilisateur (Upstash `kessia-staging-ratelimit` /
`kessia-production-ratelimit`, variables posées sur les projets Vercel
`kessia-staging` et `kessia`) est prise en compte mais reste **non
vérifiée par ce rapport**.

### Étape 3 — Validation locale (résultats réels)

| Vérification | Résultat |
|---|---|
| `npm run typecheck` | ✅ 0 erreur |
| `npm run lint` | ✅ 0 warning |
| `npm run test` | ✅ 225/225 |
| `npm run test:integration` (`USE_TEST_DB=1`) | ✅ 18 fichiers, 68/68 |
| `npm run build` | ✅ succès |
| `npm run test:e2e:isolated` | ⚠️ **55 passed / 2 failed** |

Détail E2E : `marketplace-delivery.spec.ts:14` et `tontine.spec.ts:37` —
chacun correspond à une signature déjà documentée comme préexistante
dans `TICKET_CI_E2E_FAILURES.md` (timing métier livraison ; violation de
mode strict Playwright, famille tontine déjà connue). `auth.spec.ts:12`
est passé sur ce run (cohérent avec sa nature intermittente déjà
caractérisée). **Aucun nouvel échec, aucune régression liée à P1.12.**

### Étape 4 — Déploiement Staging : BLOQUÉ, conformément au mandat

`staging.yml` ne se déclenche que sur `push: branches: [main]` (le
`workflow_dispatch` ne permet pas de contourner cela : `afd23ef`
n'existe sur aucune référence du dépôt distant, donc rien à exécuter
contre). Aucun mécanisme du dépôt ne permet de déployer ce commit sur
Staging sans un `git push`. Conformément à l'instruction explicite de
l'utilisateur, **aucun push n'a été effectué**.

> **Staging ne peut pas être validé sans pousser le commit sur main, et
> aucun push n'est autorisé à cette étape.**

### Étapes 5, 6, 7 — Non exécutées

Ces étapes nécessitent un déploiement Staging réel et joignable
(requêtes HTTP contre les routes `auth.*`, vérification des commandes
Redis Upstash, non-régression en conditions réelles). Le déploiement
n'ayant pas eu lieu (Étape 4), **elles n'ont pas pu être exécutées** —
aucun résultat n'est inventé ou supposé.

### Classification de ce qui bloque

Ce n'est **pas un défaut du code** de `afd23ef` (Étapes 1-3 entièrement
vertes) — c'est une **contrainte d'infrastructure préexistante**, déjà
identifiée dans le plan initial (`PHASE0_EXECUTION_PLAN.md`, item P1.9
« Staging » d'origine : « désactiver l'auto-deploy prod sur push main »,
jamais traité). Sévérité : **P1 infrastructure**, pas P0 — n'affecte pas
l'application elle-même, seulement la capacité à valider un changement
sur Staging isolément.

**Correction minimale envisageable** (non implémentée, hors périmètre de
ce cycle) : découpler le déclenchement de `staging.yml`/Staging de celui
de la production — par exemple domaine Vercel Production limité à une
branche dédiée, ou un `Ignored Build Step` sur le projet `kessia`. Décision
et implémentation à traiter séparément, sur autorisation explicite.

---

## 1. Phase 1 — Inspection préalable (résumé)

- `enforceRateLimit()` est appelé depuis **25 fichiers** (auth, wallet,
  marketplace, KYC, IA, support, tontine, business, guarantee, discover,
  profile, payments webhooks). Liste complète en annexe (§7).
- Les **7 routes d'authentification** partagent toutes le préfixe
  `auth.` dans le nom passé à `enforceRateLimit` : `auth.login`,
  `auth.register`, `auth.2fa`, `auth.pin_verify`, `auth.request-otp`,
  `auth.verify-otp`, `auth.change-password` — permet d'identifier les
  « routes explicitement protégées » **sans modifier aucun des 25
  fichiers appelants**.
- `@upstash/ratelimit`/`@upstash/redis` déjà présents dans
  `package.json`, jamais utilisés en pratique (`UPSTASH_REDIS_REST_URL`/
  `_TOKEN` absents partout).
- Aucune logique métier couplée au mécanisme — `enforceRateLimit`
  renvoie soit `null` (continuer), soit une `Response` 429 ; les
  appelants ne connaissent pas Upstash.
- **Confirmé : aucune configuration Upstash nulle part** — ni
  `.env.local`, ni `.env.test`, ni référencée dans `staging.yml`,
  `vercel.json`, ou `scripts/smoke.mjs`.
- **Point critique découvert** : `staging.yml` se déclenche sur
  `push: branches: [main]` — le même événement qui déclenche le
  déploiement continu Vercel de la production. Aucun mécanisme de ce
  dépôt ne permet de déployer sur Staging sans déployer aussi en
  production.

## 2. Phase 2 — Implémentation

**Seul fichier applicatif modifié : `lib/security/rate-limit.ts`.**

- Configuration d'exécution (`NODE_ENV`, présence Upstash, bypass E2E)
  déplacée de constantes figées au chargement du module vers des
  fonctions relisant `process.env` à chaque appel — comportement
  observable inchangé, mais testable sans réimport de module.
- Nouvelle fonction exportée `isCriticalRoute(name)` :
  `name.startsWith('auth.')`.
- Nouvelle fonction interne `evaluateRateLimit()` qui rapporte, en plus
  du résultat, **quelle source a répondu** (`upstash` ou `memory`, et
  pourquoi) — utilisée uniquement par `enforceRateLimit` pour décider du
  fail-closed. `checkRateLimit()` (fonction publique existante) garde
  exactement sa signature et son comportement — les 4 tests déjà
  existants n'ont pas été modifiés.
- `enforceRateLimit()` : si la source est `memory` **et** que
  l'environnement est `production` **et** que la route est
  `isCriticalRoute(name)` → renvoie `429` générique (« Service
  momentanément limité. Réessayez dans quelques instants. »), sans
  aucun détail interne (raison, fournisseur, variable d'environnement).
  Dans tous les autres cas, comportement strictement identique à avant.

## 3. Comportement avant / après, par environnement

| Environnement | Avant | Après |
|---|---|---|
| Dev / Test / CI | Mémoire, jamais fail-closed | **Inchangé** |
| Production + Upstash opérationnel | Upstash | **Inchangé** (Upstash, distribué) |
| Production + Upstash absent, route `auth.*` | Mémoire silencieuse (inefficace) | **Fail-closed (429)** |
| Production + Upstash absent, route non-`auth.*` | Mémoire silencieuse | **Inchangé** (mémoire) |
| Production + erreur Upstash, route `auth.*` | Mémoire silencieuse | **Fail-closed (429)** |
| Production + erreur Upstash, route non-`auth.*` | Mémoire silencieuse | **Inchangé** (mémoire) |

## 4. Routes protégées, limites et fenêtres (inchangées, non modifiées ici)

| Route (`name`) | limit | windowMs | Protégée fail-closed ? |
|---|---|---|---|
| `auth.login` | 10 | 15 min | ✅ |
| `auth.register` | 5 | 60 min | ✅ |
| `auth.2fa` | 10 | 15 min | ✅ |
| `auth.pin_verify` | 5 | 15 min | ✅ |
| `auth.request-otp` | 8 | 15 min | ✅ |
| `auth.verify-otp` | 15 | 15 min | ✅ |
| `auth.change-password` | 5 | 15 min | ✅ |
| `discover` | 120 | 60 s | non |
| `marketplace.list` | 60 | 60 s | non |
| `marketplace.delivery.webhook` | 120 | 60 s | non |
| `payments.webhook.<provider>` | 120 | 60 s | non |
| `tontine.join` | 10 | 60 s | non |
| `guarantee.claim` | 3 | 60 min | non |
| `ai.chat`, `business.invoice_email`, `kyc.document`, `marketplace.address`, `marketplace.delivery`, `marketplace.create`, `marketplace.order`, `payments`, `profile.privacy`, `support.attachment`, `tontine.join-request`, `wallet.deposit`, `wallet.transfer` | (valeurs existantes, non modifiées) | (inchangées) | non |

Aucune limite ni fenêtre n'a été modifiée dans ce chantier.

## 5. Tests (Phase 3) — `lib/security/rate-limit.test.ts`, 16 tests (4 existants + 12 nouveaux)

1. Production + Upstash configuré → rate limiting distribué, `limit`/
   `windowMs` transmis correctement au fournisseur.
2. Production + Upstash absent, route `auth.*` → fail-closed (429,
   sans détail interne).
3. Dev/Test + Upstash absent → comportement mémoire inchangé (routes
   `auth.*` et autres).
4. Upstash configuré → dépassement de limite signalé par le fournisseur
   → 429.
5. Erreur du fournisseur Upstash (rejet) → fail-closed sur route
   protégée, repli mémoire inchangé sur route non protégée.
6. Aucune fuite de secret/détail interne dans les réponses (vérifié par
   regex négative sur le message d'erreur).
7. Deux utilisateurs distincts (`by`) sur la même route ne partagent
   jamais leur compteur.
8. Bypass E2E (`E2E_RATE_LIMIT_BYPASS=1`) toujours prioritaire, même en
   production sans Upstash.
9. `isCriticalRoute` correctement scopée aux 7 routes `auth.*`, aucune
   autre route.

**Note technique** : la simulation d'une erreur fournisseur via
`vi.fn().mockRejectedValue()`/`mockImplementation(() => Promise.reject(...))`
déclenchait un faux positif « unhandled rejection » de Vitest malgré un
`try/catch` applicatif fonctionnant correctement (vérifié par les logs
`console.error` systématiquement émis). Contourné en simulant l'erreur
par un `throw` direct dans la classe mockée, hors du spy `vi.fn()` —
comportement applicatif testé identique, uniquement le mécanisme de
simulation a changé.

## 6. Phase 4 — Vérification locale (résultats réels)

| Vérification | Résultat |
|---|---|
| `tsc --noEmit` | ✅ 0 erreur |
| `next lint` | ✅ 0 warning |
| `vitest` (unit) | ✅ **225/225** (213 précédents + 12 nouveaux) |
| `test:integration` (`USE_TEST_DB=1`) | ✅ **18 fichiers, 68/68** (inchangé) |
| `npm run build` | ✅ succès |
| `test:e2e:isolated` | ⚠️ **54 passed / 3 failed** |

Détail des 3 échecs E2E : `auth.spec.ts:12`, `marketplace-delivery.spec.ts:14`,
`tontine.spec.ts:37` — chacun correspond individuellement à une
signature déjà documentée comme préexistante dans
`TICKET_CI_E2E_FAILURES.md`. `auth.spec.ts:12` en particulier est une
flakiness de déconnexion déjà caractérisée et confirmée préexistante
(A/B `git stash`, P0.5) — sans lien avec le rate limiting.
`E2E_RATE_LIMIT_BYPASS=1` (déjà actif dans `playwright.config.ts`) a
été confirmé neutraliser entièrement le nouveau fail-closed : aucun
nouvel échec lié à l'authentification.

## 7. Phase 5 — Staging / Production : NON EFFECTUÉ

**Conformément à la règle critique du mandat**, aucun déploiement n'a
été effectué. Constat (Phase 1) : `UPSTASH_REDIS_REST_URL`/
`UPSTASH_REDIS_REST_TOKEN` sont absentes de tous les environnements
connus (Staging et Production compris — aucune référence trouvée dans
`staging.yml`, `vercel.json`, `scripts/smoke.mjs`). De plus,
`staging.yml` se déclenche sur le même `push: branches: [main]` que le
déploiement continu Vercel de la production — il n'existe **aucun**
moyen, dans la configuration actuelle du dépôt, de déployer sur Staging
sans déployer simultanément en production.

**Conséquence** : pousser ce commit vers `origin main` maintenant
activerait immédiatement le fail-closed sur `login`/`register`/`2FA`/
`PIN`/OTP/changement de mot de passe **en production**, sans Upstash
pour les servir — ces routes deviendraient inutilisables pour de vrais
utilisateurs du déploiement de démonstration en ligne. C'est exactement
le scénario que le mandat interdisait explicitement.

**Ce qui manque avant tout push/déploiement** :
1. Provisionner une base Upstash Redis (au moins pour Production ;
   Staging recommandé aussi).
2. Configurer `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` dans
   les variables d'environnement Vercel (Production) et/ou GitHub
   Secrets (environnement `staging`, à l'image de `STAGING_DATABASE_URL`).
3. Confirmer leur bonne prise en compte (ex. `console.info('[SECURITY]
   Rate limiting : Upstash Redis (partagé).')` visible dans les logs de
   démarrage) avant tout push vers `main`.
4. Idéalement, définir un mécanisme de déploiement Staging découplé de
   la production (hors périmètre de ce chantier) pour permettre de
   vérifier en toute sécurité avant bascule production.

## 8. Risques résiduels

- Le fail-closed ne couvre que les 7 routes `auth.*` — un choix
  délibéré (brute-force sur l'authentification est le risque le plus
  aigu), pas une lacune : les 18 autres routes gardent leur repli
  mémoire existant, comportement inchangé.
- Tant que les variables Upstash ne sont pas configurées, ce commit
  reste **inerte** en pratique (non déployé) — le risque décrit ci-
  dessus (indisponibilité de l'authentification) ne peut se matérialiser
  qu'au moment d'un push, pas avant.
- Aucun changement aux limites/fenêtres existantes.

## 9. Conformité au périmètre

- ✅ Seul `lib/security/rate-limit.ts` (+ son test) modifié parmi le
  code applicatif — aucun des 25 fichiers appelants touché.
- ✅ Ledger, Wallet, Escrow, Payments (règles métier), Tontines,
  Marketplace, KYC/AML, IA, P0.2, P0.3, CSP/HSTS (Lot C), schéma
  Prisma/migrations, contrats API : non touchés.
- ✅ Aucun secret manipulé, révélé ou modifié.
- ✅ Aucun test existant modifié — uniquement des tests ajoutés.
- ✅ 1 seul commit cohérent.
- ✅ **Aucun déploiement production ou staging effectué.**

---

## Annexe §7 — 25 appelants de `enforceRateLimit` (aucun modifié)

`ai/chat`, `auth/2fa/verify`, `auth/change-password`, `auth/login`,
`auth/pin/verify`, `auth/register`, `auth/request-otp`,
`auth/verify-otp`, `business/[id]/invoices/[invoiceId]/email`,
`discover`, `guarantee/claims`, `kyc/documents`,
`marketplace/addresses`, `marketplace/deliveries`,
`marketplace/deliveries/webhooks/miaride`, `marketplace` (GET),
`marketplace/[id]/order`, `payments`,
`payments/webhooks/[provider]`, `profile/privacy`,
`support/[id]/attachments`, `tontine/join`,
`tontine/[id]/join-requests`, `wallet/deposit`, `wallet/transfer`.

## Verdict

**P1.12 = Implémenté et vérifié localement. NON déployé — en attente de
provisionnement Upstash et de votre autorisation explicite avant tout
push/déploiement.**
