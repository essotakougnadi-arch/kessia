---
title: "KESSIA — Phase 0 : Production Hardening — Plan d'exécution"
date: "10 septembre 2026"
---

# KESSIA — Phase 0 : Production Hardening — Plan d'exécution

**Base** : audit `production-readiness-2026-09-10.md` sur le commit `a9d6388`.
**Objectif** : faire passer KESSIA d'un MVP de démonstration à une plateforme prête pour un **pilote contrôlé** — sans reconstruire l'application, sans changer l'architecture globale, sans supprimer de fonctionnalité, en préservant Ledger / séquestres / idempotence / audit log / anti-fraude / RBAC / KYC / tests existants.

**Ce document est un plan. Aucune ligne de code n'a été modifiée.**

---

## 0. Analyse du dépôt — points de départ vérifiés

| Sujet | État constaté |
|---|---|
| Framework | `next@14.2.5` · `react@18.3.1` · `next-auth@5.0.0-beta.19` **jamais importé** (dépendance morte, tire des peers `next@16`/`react@19`). |
| Cible de mise à niveau Next | `next@14.2.35` (dernière 14.2.x — patchs de sécurité uniquement, **App Router inchangé**, compatible React 18). Next 15/16 = React 19 + `cookies()`/`headers()`/`params` async → **hors périmètre Phase 0**. |
| Vulnérabilités | `npm audit` : 15 (2 critiques, 9 hautes). Next.js : contournement middleware `GHSA-f82v-jwr5-mffw`, RCE `GHSA-p293-qw3h-jr36` / `GHSA-2xp9-vwfh-vxw4`. `postcss` (haute, prod), `uuid` (modérée, prod). Le reste = devDeps (esbuild, glob, minimatch, js-yaml, @vitest/mocker). |
| Session | `store/authStore.ts` : zustand `persist` → `localStorage['kessia-auth']` (access + refresh + user). Cookie `kessia-access-token` posé côté client via `document.cookie` (**non-HttpOnly**), `SameSite=Lax`, `Secure` sur https. `lib/api/client.ts` envoie `Authorization: Bearer` depuis le store, refresh dédupliqué sur 401. `middleware.ts` (edge, `jose`) lit le cookie pour gater `PROTECTED_ROUTES` + rôle `/admin`. `lib/auth/middleware.ts::withAuth` vérifie **le JWT seulement** (Bearer, ou cookie pour les GET), **ne consulte pas la table `session`**. Access 15 min / refresh 30 j hashé, rotation en place (`lib/auth/session.ts::rotateRefreshToken` — met à jour la session en place, pas de détection de réutilisation). **43 fichiers** consomment `useAuthStore` ; ~22 hooks utilisent `token` comme clé SWR + gate. |
| Webhooks | `app/api/v1/payments/webhooks/[provider]/route.ts` et `app/api/v1/marketplace/deliveries/webhooks/miaride/route.ts` : HMAC-SHA256 + `timingSafeEqual` sur `request.text()` (raw), handlers idempotents et rate-limités. **`if (!secret) return true`** → fail-open. La route cron, elle, a le bon garde (`!secret → NODE_ENV !== 'production'`). |
| Marketplace order | `app/api/v1/marketplace/[id]/order/route.ts` : `idem = MKT_ORDER_${item.id}_${userId}_${Date.now()}` (retry-unsafe). `postDoubleEntry` (débit) **puis** une `$transaction` séparée décrémente le stock + crée la commande. Contrôle de stock = lecture avant, non verrouillée. `MarketplaceOrder.ledgerRef String?` non unique. Le panier (`store/cartStore.ts`) appelle cette route en boucle, une fois par unité. |
| Config prod | `next.config.js` : en-têtes présents (X-Frame DENY, nosniff, Referrer-Policy, Permissions-Policy, CSP `unsafe-inline`/`unsafe-eval`), **pas de HSTS**. `images.remotePatterns: [{ hostname: '**' }]`. `experimental.serverActions.allowedOrigins: ['localhost:3000']`. `lib/config/demo.ts::DEMO_MODE = DEMO_MODE==='1' && SMS_PROVIDER==='DEV'` (renvoie l'OTP dans la réponse). `NEXT_PUBLIC_DEMO_MODE` → panneau de comptes de test sur `/login`. Aucun garde « prod + DEMO_MODE → refuse de démarrer ». |
| Migrations | **Aucun `prisma/migrations/`.** `prisma db push` partout (CI e2e/integration, scripts). `db:migrate` = `prisma migrate dev` (dev), non utilisé. |
| Réconciliation | `lib/tontine/escrow.ts` porte déjà l'invariant séquestre tontine (`escrowExpectedHeld`, `EscrowReconciliation`). Pas d'équivalent wallet (`Σ ledger == balance`) ni marketplace. Pas de job périodique. |
| Cron | `runTontineTick` + `runDeliveryTick` + `runMarketplaceEscrowTick` + `runRetentionPurge` dans un `Promise.all`. **Aucun verrou** (advisory lock) → double exécution possible. |
| Rate limit | `lib/security/rate-limit.ts` : Upstash si `UPSTASH_REDIS_REST_URL/TOKEN`, **repli mémoire sinon** (inopérant en serverless). |
| Tests | 182 unit · 13 `.itest.ts` (vraie base, `test/integration/`) · 16 E2E (`e2e/`). CI = lint + typecheck + unit + build. `integration.yml` + `e2e.yml` séparés (Postgres éphémère). Base de test isolée en place (`.env.test`, `db:test:reset`, ADR 0044). |

---

## P0.0 — PRÉREQUIS : socle de migrations (avant tout changement de schéma)

> **Justification du réordonnancement** (l'audit classait ça en P1.8) : les items P0.2 (session) et P0.4 (idempotence marketplace) ajoutent des colonnes au schéma. Toute évolution de schéma en Phase 0 **doit** passer par une migration versionnée, sinon on aggrave le problème #32. On établit donc le socle en premier.

- **Problème** : `prisma db push` = pas d'historique, pas de rollback, application en direct.
- **Fichiers** : `prisma/migrations/` (nouveau), `package.json` (scripts), `.github/workflows/*.yml`, `scripts/db-test-reset.mjs`, `docs/development/testing.md`, nouveau `docs/audit/DATABASE_MIGRATION_PLAN.md`.
- **Dépendances** : aucune. **Doit être fait en premier.**
- **Modification** :
  1. `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0000000000000_init/migration.sql` (baseline reflétant l'état actuel).
  2. `npx prisma migrate resolve --applied 0000000000000_init` sur les bases existantes (démo + à venir staging/prod) pour les marquer sans ré-exécuter.
  3. Scripts : `db:migrate:deploy` = `prisma migrate deploy` ; garder `db:migrate` = `prisma migrate dev` (dev) ; `db:push` conservé **uniquement** pour `db:test:reset` (base jetable) avec un commentaire explicite.
  4. CI/CD : `e2e.yml` / `integration.yml` → `prisma migrate deploy` au lieu de `db push` (base neuve = migrations appliquées from scratch).
  5. `docs/audit/DATABASE_MIGRATION_PLAN.md` : procédure de création d'une migration, revue, application (`migrate deploy`), **rollback** (down-migration manuelle ou restauration), règles (jamais `db push` sur staging/prod ; toute migration destructive → sauvegarde préalable + fenêtre de maintenance).
- **Risques** : la baseline doit correspondre **exactement** au schéma déployé sur la base de démo → vérifier avec `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel` = vide avant de `resolve`. Si divergence, l'aligner d'abord.
- **Tests** : `prisma migrate deploy` sur une base vierge → `prisma migrate status` propre ; `npm run test:integration` vert ; `npm run db:test:reset` fonctionne toujours.
- **Effort** : **M**.

---

## P0 — BLOQUANTS

### P0.1 — Sécurité Next.js

- **Problème (#1, #4, #25)** : `next@14.2.5` + 15 vulns npm ; contournement d'autorisation du middleware, RCE.
- **Fichiers** : `package.json` (`next`, `eslint-config-next`, `postcss`, `uuid`), `package-lock.json`, `next.config.js` (revalidation), CI `ci.yml`.
- **Dépendances** : P0.0 (rien de schéma ici, mais on veut le lock propre avant le reste).
- **Modification** :
  1. `next` `14.2.5 → 14.2.35` + `eslint-config-next` idem. Patch-only : App Router, RSC, middleware API inchangés — **pas de breaking change attendu**. Corrige `GHSA-f82v-jwr5-mffw` (le middleware n'est plus contournable via `x-middleware-subrequest`) et la liste des RCE/SSRF/cache-poisoning.
  2. **Supprimer `next-auth`** (dépendance morte, aucun import) + `NEXTAUTH_SECRET`/`NEXTAUTH_URL` de `.env.example` → retire les peers `next@16`/`react@19` bruyants.
  3. `postcss` : mise à niveau vers la version corrigée (transitive via `next` — le bump Next devrait suffire ; sinon `overrides` dans `package.json`).
  4. `uuid` : bump vers `>=11.1.1` (l'usage dans `lib/utils/crypto.ts` est `uuidv4()` — pas de breaking).
  5. devDeps (`esbuild`/`glob`/`minimatch`/`js-yaml`/`@vitest/mocker`) : `npm audit fix` sans `--force` d'abord ; si résiduel, `overrides`. Ne bloque pas la prod (hors runtime) mais on nettoie.
  6. **CI** : nouvelle étape `Security audit` = `npm audit --audit-level=high` (bloquante) + `npm run typecheck` déjà là. Ajouter un fichier `.github/dependabot.yml` (npm, hebdo).
- **Règle respectée** : aucun contrôle de sécurité désactivé pour faire passer le build. Si une lib refuse de se mettre à jour proprement, on documente et on `override`, on ne baisse pas `--audit-level`.
- **Risques de régression** : très faibles (patch Next). Points de vigilance : comportement de `next/image` (optimisation), `serverActions` (voir P0.5), `middleware` matcher. Suppression `next-auth` : vérifier qu'aucun `import` résiduel (grep déjà fait = 0).
- **Tests** : `npm run build` + `tsc` + `lint` + `vitest` (182) + `npm run test:e2e:isolated` (16 suites) + `npm run test:integration` (13). Vérif prod post-déploiement (smoke).
- **Effort** : **S–M**.
- **Livrable associé** : `SECURITY_REMEDIATION_REPORT.md` (section dépendances).

### P0.2 — Sessions et tokens

- **Problème (#2, #3, #26)** : access + refresh + user dans `localStorage` ; cookie non-HttpOnly ; `withAuth` ne vérifie pas la session ; pas de détection de réutilisation de refresh token.
- **Fichiers** :
  - Cœur : `store/authStore.ts`, `lib/api/client.ts`, `lib/auth/middleware.ts`, `lib/auth/session.ts`, `middleware.ts`.
  - Routes auth : `app/api/v1/auth/{login,register,verify-otp,refresh,logout,change-password,2fa/verify,pin/verify}/route.ts`, `app/api/v1/auth/sessions/route.ts`.
  - Sweep (~22 hooks + 6 composants) : tous les `useAuthStore((s) => s.accessToken)` utilisés comme clé SWR/gate → `useAuthStore((s) => s.isAuthenticated)` (ou `user?.id`).
  - `hooks/useAuth.ts` (flux login), `components/auth/PinLockGate.tsx`, `components/legal/LegalGate.tsx`, `app/documents/**/*-document-client.tsx`.
  - E2E : `e2e/helpers.ts::loginViaApi` + les 3 scripts scratchpad de vérif prod (hors repo).
  - Schéma : `Session` (+ `revokedAt DateTime?`, `replacedById String?` pour la détection de réutilisation) → **migration**.
- **Dépendances** : P0.0 (migration), P0.1 (Next patché → le middleware redevient fiable).
- **Modification proposée** :
  1. **Cookies HttpOnly posés côté serveur.** Nouveau `lib/auth/cookies.ts` : `setAuthCookies(res, {accessToken, refreshToken})` / `clearAuthCookies(res)`.
     - `kessia_at` : HttpOnly, Secure, `SameSite=Lax`, `Path=/`, `Max-Age` = durée access (15 min).
     - `kessia_rt` : HttpOnly, Secure, `SameSite=Strict`, **`Path=/api/v1/auth/refresh`** (le refresh token n'est jamais envoyé ailleurs), `Max-Age` = 30 j.
     - Plus aucun cookie posé par le JS. `syncAuthCookie` supprimé de `authStore`.
  2. **`authStore` ne persiste plus les tokens.** `partialize` → `{}` (ou rien). Au chargement, `hooks/useAuth` (ou un `<AuthBootstrap>` dans le layout) appelle `GET /api/v1/me` (cookie auto) → hydrate `user` en mémoire. `isAuthenticated` dérivé du succès de cet appel.
  3. **`lib/api/client.ts`** : `credentials: 'same-origin'` explicite, **retirer** l'ajout du header `Authorization`. Le refresh sur 401 appelle `POST /api/v1/auth/refresh` **sans body** (le cookie `kessia_rt` porte le token) ; le serveur re-pose les cookies.
  4. **`withAuth`** : lire le token depuis le cookie `kessia_at` **pour toutes les méthodes** (plus de distinction GET/POST — voir CSRF ci-dessous). Vérifier le JWT **puis** vérifier que la session existe et n'est pas révoquée (`prisma.session.findFirst({ where: { token, revokedAt: null, expiresAt: { gt: now } } })`). Cache court (in-memory LRU 30 s par token) pour limiter la charge DB — invalidé à la révocation.
     - Variante : sur les **opérations sensibles** (transfert, retrait, contribution, actions admin, changement de sécurité), toujours revérifier la session sans cache.
  5. **CSRF** : `SameSite=Lax` sur `kessia_at` bloque déjà les POST cross-site. Ajouter dans `withAuth` (méthodes non-GET) une vérification d'`Origin` / `Sec-Fetch-Site` (`same-origin` requis). Documenter. (Pas de token double-submit nécessaire pour un front same-origin ; on l'ajoutera si un besoin cross-origin apparaît.)
  6. **`middleware.ts`** : lit `kessia_at` (nom mis à jour), inchangé sinon. Le middleware reste une **commodité UX** (redirection) ; la sécurité est côté API (déjà le cas, cf. commentaire du fichier).
  7. **Révocation** :
     - `logout` : `clearAuthCookies` + `session.update({ revokedAt: now })` pour la session courante.
     - `change-password` : `session.updateMany({ where: { userId }, data: { revokedAt: now } })` (déjà fait via `deleteMany` — on passe à `revokedAt` pour garder la trace) + `clearAuthCookies`.
     - `admin suspend` : idem `updateMany revokedAt` (déjà `deleteMany` dans `admin/users/[id]`).
  8. **Détection de réutilisation de refresh token** : `rotateRefreshToken` ne fait plus un `update` en place mais crée une **nouvelle** ligne `Session` (`replacedById` sur l'ancienne, `revokedAt` sur l'ancienne). Si un refresh token **déjà `revokedAt`** est présenté → **révoquer toute la famille** (`updateMany` sur `userId` avec la même racine) + audit `auth.refresh_reuse_detected` + notif SECURITY. C'est le signal standard OWASP de vol de token.
  9. **`/api/v1/auth/sessions`** : la liste montre `revokedAt`, la révocation d'une session distante = `revokedAt`.
- **Risques de régression + mitigations** :
  - **Le plus gros risque du plan.** 43 fichiers, flux d'auth complet.
  - *Navigation SSR / accès direct à un document PDF* : `withAuth` lisant le cookie pour toutes les méthodes couvre le cas. Vérifier `app/documents/**`.
  - *Rehydration* : pendant l'appel `/me` initial, l'UI doit afficher un état "chargement" et non "déconnecté" (éviter un flash `/login`). Gérer dans `<AuthBootstrap>`.
  - *E2E* : `loginViaApi` doit passer par le vrai `POST /login` et laisser Playwright capturer le `Set-Cookie` (`context.request` le fait automatiquement) — supprimer l'injection manuelle de `localStorage`.
  - *Rollout* : garder une compat transitoire (lire l'ancien cookie/localStorage une fois pour migrer les sessions actives) OU accepter que tous les utilisateurs (démo) se reconnectent une fois — acceptable en Phase 0.
  - *`unsafe-inline` CSP* : durci séparément en P0.5 (dépendance : les scripts d'init thème/accent devront passer aux nonces).
- **Tests** :
  - Unit : `lib/auth/cookies.ts` (attributs), `rotateRefreshToken` (rotation + réutilisation → famille révoquée).
  - Intégration (nouveau `test/integration/session-security.itest.ts`) : login pose 2 cookies HttpOnly ; `withAuth` refuse un JWT valide dont la session est `revokedAt` ; réutilisation d'un refresh token révoqué → 401 + famille révoquée ; `change-password` invalide les autres sessions immédiatement ; `admin suspend` → l'access token de la cible est refusé **sans attendre 15 min**.
  - E2E : parcours login/logout/reconnexion ; ouverture d'un 2ᵉ onglet ; accès direct à un document.
  - Vérif : `tsc` + `lint` + `vitest` + `test:e2e:isolated` + `test:integration` + build.
- **Effort** : **L**.
- **Livrable associé** : `SECURITY_REMEDIATION_REPORT.md` (section sessions).

### P0.3 — Webhooks

- **Problème (#11)** : `if (!secret) return true` = fail-open.
- **Fichiers** : `app/api/v1/payments/webhooks/[provider]/route.ts`, `app/api/v1/marketplace/deliveries/webhooks/miaride/route.ts`, nouveau `lib/webhooks/verify.ts` (mutualisé), nouveau modèle `WebhookEvent` (journal + replay) → **migration**, `lib/audit/audit.service.ts` (déjà là).
- **Dépendances** : P0.0.
- **Modification** :
  1. `lib/webhooks/verify.ts::verifyWebhook(rawBody, signatureHeader, secretEnvName)` :
     - `secret` absent **et** `NODE_ENV === 'production'` → **`false`** (rejet 401). En dev/test sans secret → accepté **et tracé** (`WebhookEvent { verified: false }`).
     - `secret` présent → HMAC-SHA256 sur le raw body + `crypto.timingSafeEqual` (déjà le cas), longueurs comparées.
  2. **Restriction de source** : liste d'IP/CIDR autorisées via `PAYMENT_WEBHOOK_ALLOWED_IPS` / `MIARIDE_WEBHOOK_ALLOWED_IPS` (optionnelle en Phase 0 mais le code la lit ; `X-Forwarded-For` derrière Vercel).
  3. **Journal + replay** : `model WebhookEvent { id, provider, eventType, rawBody, signature, verified, receivedAt, processedAt, result, replayOf String? }`. Chaque webhentrée = une ligne. Route admin `POST /api/v1/admin/webhooks/[id]/replay` (rôles `FINANCE_ROLES`, ré-exécute le handler avec `replayOf`, idempotence garantit 0 double effet).
  4. **Idempotence stricte** : les handlers utilisent déjà `PAYTX_<id>` / `MKT_SETTLE_<id>` — ajouter un contrôle explicite `WebhookEvent` (même `(provider, eventType, providerRef)` déjà traité → `result: 'duplicate'`, pas de re-traitement).
  5. Rate limit déjà présent — conservé.
- **Risques** : faibles. Vigilance : ne pas casser les tests E2E `marketplace-delivery` qui postent sur le webhook Miaride **sans secret** → ils tournent en `NODE_ENV=production` (E2E). Solution : le garde regarde `NODE_ENV === 'production' && !process.env.E2E_RATE_LIMIT_BYPASS` (le flag E2E existant sert de marqueur "environnement de test"), ou une var dédiée `WEBHOOKS_ALLOW_UNSIGNED_FOR_TESTS`. À trancher — je propose la var dédiée, explicite.
- **Tests** : nouveau `test/integration/webhook-security.itest.ts` — prod sans secret → 401 ; mauvaise signature → 401 ; bonne signature → 200 + `WebhookEvent.verified=true` ; rejeu du même événement → `duplicate`, wallet inchangé ; **test d'attaque** : forger `delivery.status=delivered` sans signature en prod → 401, aucun crédit.
- **Effort** : **M**.
- **Livrable associé** : `SECURITY_REMEDIATION_REPORT.md` + `PAYMENT_READINESS_REPORT.md`.

### P0.4 — Marketplace : double commande / double débit

- **Problème (#9, #14)** : clé d'idempotence = `Date.now()` ; débit et stock/commande dans deux transactions séparées ; contrôle de stock non verrouillé.
- **Fichiers** : `app/api/v1/marketplace/[id]/order/route.ts`, `lib/validations/marketplace.ts` (`orderSchema`), `store/cartStore.ts`, `app/(dashboard)/marketplace/[id]/item-client.tsx` + `app/(dashboard)/marketplace/cart/cart-client.tsx` (envoi de la clé), `hooks/useMarketplace.ts` (`order`), schéma `MarketplaceOrder` (+ `idempotencyKey String? @unique`) → **migration**, `lib/ledger/ledger.service.ts` (revue de `postDoubleEntry` pour usage dans une `tx` fournie).
- **Dépendances** : P0.0.
- **Modification** :
  1. **Clé stable côté client** : `orderSchema` + `idempotencyKey: z.string().uuid()`. Le client génère un `crypto.randomUUID()` **au moment où l'utilisateur confirme** (pas au rendu) et le **réutilise** sur tout rejeu (stocké sur la ligne du panier / l'intention d'achat). `cartStore` : une `idempotencyKey` par ligne, régénérée seulement après succès. Header `Idempotency-Key` **et** champ de body (le body fait foi).
  2. **Chemin transactionnel unique** :
     - `MarketplaceOrder.idempotencyKey @unique`. Début : `findUnique({ where: { idempotencyKey } })` → si trouvé, **renvoyer la commande existante** (200, pas de re-débit).
     - Sinon : `prisma.$transaction` unique qui (a) `SELECT ... FOR UPDATE` sur `marketplace_items WHERE id = ?` (verrou ligne), (b) revérifie `stock > 0` et `status = ACTIVE`, (c) décrémente le stock, (d) crée la `MarketplaceOrder` (status provisoire), (e) `createLedgerEntry`/`postDoubleEntry` **dans la même `tx`** (les fonctions ledger acceptent déjà un `Prisma.TransactionClient` — sinon on ajoute le paramètre, changement mineur et rétro-compatible), (f) finalise le statut. Tout réussit ou tout est annulé — plus de fenêtre « argent parti, commande absente ».
     - Le mode `TONTINE` : même verrou sur l'article + création atomique.
  3. **Panier** : la boucle envoie une clé stable par unité ; un rejeu réseau au milieu de la boucle ne recrée rien.
  4. `idem` ledger dérivé de la clé de commande (`MKT_ORDER_<idempotencyKey>`), plus de `Date.now()`.
- **Risques de régression** :
  - `postDoubleEntry` refactoré pour accepter une `tx` : c'est le composant le plus sensible. **Mitigation** : ne pas toucher la signature publique — ajouter une **surcharge interne** `postDoubleEntryTx(tx, input)` et faire de `postDoubleEntry` un wrapper `prisma.$transaction(tx => postDoubleEntryTx(tx, input))`. Les 13 `.itest.ts` du ledger doivent rester **verts sans modification**.
  - Le verrou `FOR UPDATE` sur l'article : transactions courtes, pas de risque de deadlock (un seul verrou d'article + les verrous wallet ordonnés du ledger — l'ordre article→wallets est constant).
  - Les E2E `marketplace-cart` / `marketplace-delivery` : mettre à jour l'envoi de la clé.
- **Tests** : nouveau `test/integration/marketplace-concurrency.itest.ts` :
  - Même `idempotencyKey` envoyée 2× (séquentiel + `Promise.all`) → **une** commande, **un** débit.
  - `stock = 1`, deux acheteurs concurrents (`Promise.all`) → une commande réussit, l'autre a `OUT_OF_STOCK`, jamais de stock négatif, jamais de double débit.
  - Achat par tontine concurrent → un seul plan créé.
- **Effort** : **M–L**.
- **Livrable associé** : `SECURITY_REMEDIATION_REPORT.md` (concurrence) + `PRODUCTION_HARDENING_REPORT.md`.

### P0.5 — Configuration de production

- **Problème (#1, #36)** : `DEMO_MODE`/`NEXT_PUBLIC_DEMO_MODE`, OTP en réponse, `serverActions.allowedOrigins` localhost, `images.remotePatterns` ouvert, pas de HSTS, CSP faible, comptes de démo.
- **Fichiers** : `next.config.js`, `lib/config/demo.ts`, `app/(auth)/login/page.tsx`, `app/layout.tsx` (scripts d'init → nonces), `lib/config/env.ts` (nouveau : validation Zod des variables d'environnement au démarrage), `.env.example`, `prisma/seed.ts` (marquer les comptes de démo), nouveau `docs/audit/PRODUCTION_HARDENING_REPORT.md`.
- **Dépendances** : P0.2 (CSP sans `unsafe-inline` nécessite que rien ne pose de style/script inline non-noncé), P0.1.
- **Modification** :
  1. **Garde de démarrage** `lib/config/env.ts` : schéma Zod de toutes les variables requises. En `NODE_ENV === 'production'` : `DEMO_MODE` **doit** être absent/`0`, `NEXT_PUBLIC_DEMO_MODE` absent, `JWT_SECRET`/`JWT_REFRESH_SECRET` présents et ≠ valeurs d'exemple, `PAYMENT_WEBHOOK_SECRET` présent (warn si absent en Phase pilote), `UPSTASH_REDIS_REST_URL` présent. Échec = log `error` explicite (Next ne "crashe" pas au boot serverless, mais on peut faire échouer `next build` via un check, et exposer l'état sur `/api/health`).
  2. **`lib/config/demo.ts`** : `DEMO_MODE` force `false` si `NODE_ENV === 'production'` (double sécurité). `attachDevOtp` devient un no-op strict en prod.
  3. **`/login`** : le panneau `NEXT_PUBLIC_DEMO_MODE` déjà gated — vérifier qu'il est bien `false` en build prod.
  4. **Comptes de démo** : `prisma/seed.ts` `NE PAS exécuter en prod` (déjà commenté). Pour la base pilote : script `scripts/seed-pilot.mjs` minimal (compte admin réel uniquement, MDP fort en env) ; documenter la suppression des personas de démo de la base partagée avant bascule pilote.
  5. **`next.config.js`** :
     - `headers()` : ajouter `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
     - CSP : retirer `'unsafe-inline'`/`'unsafe-eval'` de `script-src`, passer aux **nonces** (Next `headers()` + `middleware` peut injecter un nonce ; les 2 scripts `dangerouslySetInnerHTML` de `app/layout.tsx` reçoivent `nonce={nonce}`). `style-src` : garder `'unsafe-inline'` (CSS Modules + styled inline React — acceptable, documenté) ou nonce si faisable sans casser. `connect-src`/`img-src` : restreindre (`'self'` + domaines Supabase/Upstash explicites au lieu de `https:`).
     - `images.remotePatterns` : liste explicite (`*.supabase.co` si next/image sert des URL signées, sinon supprimer `next/image` remote et servir en `<img>`). Vu que les images produits/KYC sont en data-URI/bucket, probablement `remotePatterns: []`.
     - `serverActions.allowedOrigins` : `[process.env.NEXT_PUBLIC_APP_URL]` (ou supprimer si les Server Actions ne sont pas utilisées — grep : à vérifier).
- **Risques** : la CSP nonce est le point délicat (un script/style inline oublié → page cassée). **Mitigation** : déployer d'abord en `Content-Security-Policy-Report-Only`, collecter les violations, puis basculer. HSTS `preload` : ne l'activer qu'une fois le domaine définitif fixé (irréversible ~1 an) — en pilote, `max-age` court d'abord.
- **Tests** : E2E complet (les pages se chargent, thème/accent OK sous CSP nonce) ; test unit `lib/config/env.ts` (prod + DEMO_MODE → erreur) ; vérif headers en prod (`curl -I`).
- **Effort** : **M**.
- **Livrable associé** : `PRODUCTION_HARDENING_REPORT.md`.

---

## P1 — FIABILITÉ FINANCIÈRE

### P1.6 — Réconciliation Ledger

- **Problème (#8)** : pas de job Σ(ledger)==solde ni de contrôle des séquestres, pas d'alerte.
- **Fichiers** : nouveau `lib/ledger/reconcile.ts`, `lib/tontine/escrow.ts` (réutiliser `escrowExpectedHeld`), nouveau `lib/marketplace/escrow-reconcile.ts` (ou dans `escrow.ts`), `app/api/v1/cron/tontine-tick/route.ts` (+ `runLedgerReconciliation`), `app/api/v1/admin/analytics/route.ts` (exposer l'état), nouveau `model ReconciliationRun` → **migration**, `lib/notifications/notify.ts` (alerte).
- **Dépendances** : P0.0, P1.15 (alerting — au moins un canal).
- **Modification** :
  1. `reconcileWallets()` : pour chaque `Wallet`, `Σ(ledgerEntry.direction=CREDIT) − Σ(direction=DEBIT)` (sur `COMPLETED`) == `wallet.balance` ? Divergence → `ReconciliationRun { kind: 'wallet', walletId, expected, actual, diff }` + alerte si `diff != 0`.
  2. `reconcileTontineEscrows()` : pour chaque `TONTINE_ESCROW`, `solde == escrowExpectedHeld(tontineId)` (fonction existante).
  3. `reconcileMarketplaceEscrow()` : `solde du MARKETPLACE_ESCROW == Σ(MarketplaceOrder.status=PENDING_SETTLEMENT & settlement=ON_DELIVERY).amount`.
  4. `reconcilePlatform()` : Σ(tous les soldes wallet) == 0 **si** le système est fermé (dépôts/retraits simulés créent/détruisent de la monnaie → en fait Σ = Σ(dépôts) − Σ(retraits) ; on vérifie cette égalité).
  5. Job dans le tick horaire (léger — agrégations SQL) + route admin `GET /api/v1/admin/reconciliation` (dernier run, divergences).
  6. **Alerte** : toute divergence != 0 → `notify` SECURITY aux rôles `FINANCE_ROLES` + entrée `AuditLog` `reconciliation.mismatch` + (P1.15) alerte ops.
- **Risques** : le job ne modifie **rien** (lecture seule + écriture d'un rapport) → risque de régression nul. Attention à la performance sur beaucoup de wallets → paginer / agréger en SQL (`GROUP BY walletId`).
- **Tests** : nouveau `test/integration/ledger-reconcile.itest.ts` — état sain → 0 divergence ; injecter une divergence (update direct de `wallet.balance`) → détectée + rapport + (mock) alerte. **Test d'invariant** : après une série d'opérations aléatoires (transferts, cotisations, achats, remboursements), `reconcileWallets` = 0.
- **Effort** : **M**.
- **Livrable associé** : `PRODUCTION_HARDENING_REPORT.md`.

### P1.7 — Concurrence

- **Problème (#14)** : activation tontine, contributions, rounds, stock marketplace (traité en P0.4), cron sans verrou.
- **Fichiers** : `lib/tontine/orchestrator.ts`, `app/api/v1/tontine/[id]/route.ts` (start), `app/api/v1/tontine/[id]/members/route.ts` (join → activation auto), `app/api/v1/tontine/[id]/contribute/route.ts`, `app/api/v1/cron/tontine-tick/route.ts`, `lib/db/prisma.ts` (helper advisory lock), schéma (`Tontine.version Int @default(0)` si verrou optimiste retenu) → **migration**.
- **Dépendances** : P0.0.
- **Modification** :
  1. **Verrou distribué pour le cron** : `SELECT pg_try_advisory_lock(<clé>)` au début de `handle()` ; si `false` → `200 { skipped: 'locked' }`. `pg_advisory_unlock` en `finally`. Clé = hash stable de `'kessia:cron:tick'`. Empêche deux exécutions Vercel/GitHub simultanées.
  2. **Activation de tontine** : `activateTontine` s'exécute déjà dans une `$transaction` ; ajouter un `SELECT ... FOR UPDATE` sur `tontines WHERE id = ?` en début de transaction + revérifier `status = PENDING` et `membersCount >= min` **dans** la transaction (double join concurrent → un seul active).
  3. **Contributions** : `settleContribution` passe par le séquestre + `FOR UPDATE` sur les wallets (déjà). Ajouter `FOR UPDATE` sur `tontine_contributions WHERE tontineId=? AND memberId=? AND round=?` pour empêcher un double paiement de la même échéance (aujourd'hui garde par statut, mais course possible).
  4. **Avancement de round** (`checkAndAdvanceRound`) : `FOR UPDATE` sur la tontine + idempotence sur `TPAYOUT-<id>-<round>` (déjà) — vérifier que deux `contribute` qui complètent le round simultanément ne déclenchent pas 2 payouts (le lock tontine + la clé d'idempotence suffisent).
  5. **Verrou optimiste** : je **ne** l'ajoute **pas** globalement (surcoût, risque de régression sur 40 routes). Les verrous pessimistes ciblés (`FOR UPDATE`) sur les 4 chemins financiers ci-dessus suffisent et sont cohérents avec le style existant du ledger.
- **Risques** : `FOR UPDATE` mal placé → contention/deadlock. **Mitigation** : ordre de verrouillage constant (tontine → contributions → wallets), transactions courtes, `maxWait`/`timeout` explicites (comme `postDoubleEntry`). Les 13 `.itest.ts` tontine/escrow/orchestrator doivent rester verts.
- **Tests** : `test/integration/tontine-concurrency.itest.ts` — double `start` simultané → 1 activation ; double `contribute` de la même échéance → 1 paiement ; deux `contribute` qui complètent le round → 1 payout ; double invocation du cron → la 2ᵉ `skipped`.
- **Effort** : **M**.
- **Livrable associé** : `PRODUCTION_HARDENING_REPORT.md`.

### P1.8 — Migrations

→ **Traité en P0.0** (prérequis). Le livrable `DATABASE_MIGRATION_PLAN.md` y est produit. Reste ici : après P0.2/P0.3/P0.4/P1.6/P1.7, s'assurer que chaque colonne ajoutée a bien sa migration, et interdire `db push` sur staging/prod par un check CI (`grep` dans les workflows + revue).

---

## P1 — INFRASTRUCTURE

### P1.9 — Staging

- **Problème (#35)** : aucun staging, démo = prod, même base.
- **Fichiers** : `.github/workflows/staging.yml` (activer), `.github/workflows/deploy-prod.yml` (nouveau, avec `environment: production` + approbation), `docs/audit/STAGING_DEPLOYMENT_PLAN.md`, `.env.staging.example`.
- **Dépendances** : P0.0 (migrations), P1.10 (secrets séparés).
- **Modification** :
  1. **Provisionnement** (hors code, documenté) : projet Vercel `kessia-staging`, base Supabase dédiée, bucket Storage dédié, jeu de secrets dédié.
  2. **Pipeline** : push `main` → `ci.yml` (lint/type/unit/build/**audit**) → `integration.yml` + `e2e.yml` (Postgres éphémère) → `staging.yml` (déploie sur Vercel staging via deploy hook, applique `migrate deploy`, `smoke.mjs` contre `STAGING_BASE_URL`) → **`deploy-prod.yml`** : déclenché manuellement (`workflow_dispatch`) ou sur tag `v*`, `environment: production` (approbation requise via GitHub Environments), `migrate deploy` sur prod, `smoke.mjs` contre prod, rollback documenté si smoke rouge.
  3. **Vercel** : désactiver l'auto-deploy prod sur push `main` (Vercel → Git → Production Branch = une branche `production` protégée, ou "Ignored Build Step" ; prod déployée uniquement par le workflow). `main` déploie staging.
  4. Règle : **aucune modification directe de prod depuis une branche de dev** — protection de branche sur `production`, revue obligatoire.
- **Risques** : rupture temporaire du flux de déploiement actuel (push = prod). **Mitigation** : basculer d'abord `main → staging`, valider, puis couper l'auto-prod.
- **Tests** : un cycle complet feature→CI→staging→smoke→prod exécuté et consigné.
- **Effort** : **M** (surtout provisionnement + doc).
- **Livrable associé** : `STAGING_DEPLOYMENT_PLAN.md`.

### P1.10 — Secrets

- **Problème (#19)** : pas de coffre-fort, `SUPABASE_SERVICE_ROLE_KEY` dans l'env app, pas de rotation.
- **Fichiers** : doc principalement + `lib/storage/*` (si on retire la service-role key), `.env.example`, `docs/audit/SECURITY_REMEDIATION_REPORT.md` (section secrets).
- **Dépendances** : P1.9 (séparation dev/staging/prod).
- **Modification** :
  1. **Gestionnaire** : Doppler (le plus simple avec Vercel) ou Vercel Environment Variables par environnement + rotation manuelle documentée. Choix à valider avec toi.
  2. **Séparation** : jeux de secrets distincts dev / staging / prod. Jamais de secret financier/crypto dans le repo (déjà le cas — vérifié).
  3. **`SUPABASE_SERVICE_ROLE_KEY`** : audit de son usage (`lib/storage/supabase-storage.ts`). Si c'est uniquement pour le Storage (upload/signed URL/delete du bucket KYC) → créer une **clé Storage restreinte** (politique bucket + clé à portée limitée) au lieu de la service-role (accès total base). Si impossible, isoler les appels Storage dans une fonction serverless dédiée avec sa propre variable, non exposée au reste.
  4. **Rotation** : procédure documentée pour `JWT_SECRET` (rotation avec période de grâce : accepter l'ancien+le nouveau pendant 15 min = durée access), `JWT_REFRESH_SECRET`, `PAYMENT_WEBHOOK_SECRET` (coordonnée avec le partenaire), `DATABASE_URL`.
  5. **Procédure d'urgence** : compromission d'un secret → rotation immédiate + révocation de toutes les sessions + rotation de la clé webhook + audit.
- **Risques** : rotation `JWT_SECRET` sans grâce = déconnexion massive. → implémenter la double-vérification (2 secrets acceptés temporairement).
- **Effort** : **M**.
- **Livrable associé** : `SECURITY_REMEDIATION_REPORT.md`.

### P1.11 — PostgreSQL / pool de connexions

- **Problème (#30)** : `pool_size: 15`, échecs aléatoires observés en test intensif.
- **Fichiers** : `.env.local` / `.env.example` (`DATABASE_URL` avec paramètres), `lib/db/prisma.ts`, `docs/audit/PRODUCTION_HARDENING_REPORT.md`.
- **Dépendances** : P1.9 (tester sur staging, pas sur prod).
- **Modification** :
  1. **Analyse d'abord** (règle #11 de l'audit — ne pas modifier arbitrairement) : Supabase fournit un **pooler transaction-mode** (port 6543, PgBouncer) distinct du pooler session-mode (port 5432). En serverless, Prisma doit utiliser le **transaction pooler** avec `?pgbouncer=true&connection_limit=1` par fonction, et un `directUrl` (port 5432) pour les migrations.
  2. Mesurer sur staging (script de charge `k6` ou `autocannon` sur `/api/v1/marketplace`, `/api/v1/wallet`, `/login`) le nombre de connexions consommées et la latence sous 50 / 100 / 200 utilisateurs concurrents.
  3. Ajuster : `connection_limit` Prisma, taille du pool Supabase (plan payant si nécessaire), timeouts.
  4. Documenter les chiffres réels (RPS soutenu, p95 latence, point de rupture).
- **Risques** : changer le pooler peut casser les transactions longues (PgBouncer transaction-mode ne supporte pas les prepared statements persistants — Prisma le gère avec `pgbouncer=true`). Tester intégralement `test:integration` (transactions ledger) sur la config cible.
- **Effort** : **M** (dont test de charge).
- **Livrable associé** : `PRODUCTION_HARDENING_REPORT.md`.

### P1.12 — Redis / Rate limiting

- **Problème (#21)** : repli mémoire inopérant en serverless.
- **Fichiers** : `.env` (Upstash), `lib/security/rate-limit.ts` (garde prod), `middleware.ts` (rate limit edge optionnel), `docs/audit/PRODUCTION_HARDENING_REPORT.md`.
- **Dépendances** : P1.10 (secrets Upstash par environnement).
- **Modification** :
  1. Provisionner Upstash Redis (staging + prod), poser `UPSTASH_REDIS_REST_URL` / `_TOKEN`.
  2. `lib/security/rate-limit.ts` : en `NODE_ENV === 'production'`, si Upstash **non configuré** → `console.error` + (optionnel) refuser les routes sensibles (fail-closed sur login/register/otp plutôt que fail-open). À trancher : je propose **fail-closed sur l'auth** (mieux vaut un login temporairement indisponible qu'un brute-force libre).
  3. **Edge** : Vercel Firewall (plan Pro) — règles de rate limit par IP sur `/api/v1/auth/*` et `/api/v1/*` global ; ou Cloudflare devant. Documenté, activé sur staging d'abord.
- **Risques** : fail-closed mal calibré → utilisateurs bloqués. Calibrer les limites sur les chiffres de charge (P1.11).
- **Effort** : **S–M**.
- **Livrable associé** : `PRODUCTION_HARDENING_REPORT.md`.

---

## P1 — OBSERVABILITÉ

### P1.13 — Monitoring (APM)

- **Problème (#28)** : `/api/metrics` prêt mais aucun collecteur.
- **Fichiers** : `package.json` (`@sentry/nextjs`), `sentry.*.config.ts` (nouveau), `lib/logger.ts` (transport Sentry), `instrumentation.ts` (nouveau), `next.config.js` (`withSentryConfig`), `.env` (`SENTRY_DSN`).
- **Dépendances** : P0.1 (Next patché), P1.10 (DSN par env).
- **Modification** :
  1. **Sentry** (Next.js SDK) : erreurs + traces. Capture automatique des exceptions non gérées, `logApiError` → `Sentry.captureException` avec contexte (route, userId hashé, request-id de P1.14).
  2. **Métriques métier** : spans/transactions Sentry ou métriques custom sur : création de transaction, échec de paiement, appel webhook, exécution du cron, divergence de réconciliation (P1.6), création de `FraudAlert`. Tableau de bord Sentry + `/api/metrics` (Prometheus) branché sur un scraper (Grafana Cloud gratuit, ou Vercel Observability).
  3. **Filtrage PII** : `beforeSend` retire tout champ sensible (téléphone, e-mail, tokens, data-URI). Aligné sur la règle « jamais de données sensibles dans les logs ».
- **Risques** : surcoût de perf du tracing → échantillonnage (`tracesSampleRate: 0.1` en prod, `1.0` sur les routes financières). Sentry ne doit jamais faire échouer une requête (SDK non bloquant).
- **Tests** : provoquer une 5xx en staging → visible dans Sentry avec request-id ; une divergence de réconciliation → alerte.
- **Effort** : **M**.
- **Livrable associé** : `PRODUCTION_HARDENING_REPORT.md`.

### P1.14 — Request ID / correlation ID

- **Problème (#27)** : pas de suivi bout-en-bout.
- **Fichiers** : `middleware.ts` (génère `x-request-id` si absent), `lib/logger.ts` (contexte async), nouveau `lib/observability/context.ts` (`AsyncLocalStorage`), `lib/api/response.ts` (echo `x-request-id` en réponse), `lib/ledger/*`, `lib/payments/*`, `lib/webhooks/*`, `lib/notifications/*` (propagation), `lib/audit/audit.service.ts` (stocke le `requestId`), schéma `AuditLog.requestId String?` → **migration**.
- **Dépendances** : P1.13.
- **Modification** :
  1. `middleware.ts` : `const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()` → propagé via header à la route ; renvoyé en réponse (`x-request-id`).
  2. `AsyncLocalStorage` initialisé par un wrapper de route (`withObservability`) ou lu du header dans chaque handler ; `logApiError` et `recordAudit` récupèrent le `requestId` du contexte.
  3. Chaîne : `Request → withAuth → service → ledger → payment → webhook → ledger → notification` — chaque log/audit/erreur porte le même `requestId`.
- **Risques** : `AsyncLocalStorage` + Next serverless — supporté, mais vérifier qu'il traverse bien les `await` des services. Fallback : passer le `requestId` explicitement en argument aux fonctions ledger critiques (déjà des objets `input` → un champ de plus).
- **Effort** : **M**.
- **Livrable associé** : `PRODUCTION_HARDENING_REPORT.md`.

### P1.15 — Alerting

- **Problème (#29)** : aucune alerte.
- **Fichiers** : config Sentry (alertes), nouveau `lib/observability/alert.ts` (webhook ops), `.env` (`OPS_ALERT_WEBHOOK_URL` — Slack/Discord/PagerDuty), `app/api/v1/cron/tontine-tick/route.ts` (rapport d'échec), `docs/operations/incident-runbook.md` (nouveau ou étendre `backup-recovery.md`).
- **Dépendances** : P1.13 (Sentry), P1.6 (réconciliation), P1.7 (verrou cron).
- **Modification** — alertes sur :
  | Signal | Source | Seuil |
  |---|---|---|
  | 5xx | Sentry | > 1 % des requêtes sur 5 min |
  | Latence p95 | Sentry/APM | > 2 s sur 10 min |
  | Erreurs DB / pool saturé | logs + `/api/health` | toute occurrence |
  | Échec du cron horaire | `cron/tontine-tick` (heartbeat : si pas d'exécution réussie depuis 90 min → alerte via un cron de surveillance externe type cron-job.org ou Better Uptime) | 1 |
  | Webhook rejeté en masse | `WebhookEvent.verified=false` | > 5 / 5 min |
  | Divergence ledger / séquestre | `ReconciliationRun.diff != 0` | toute occurrence |
  | Pic de `FraudAlert` | count | > 10 / h |
  | Paiement échoué | `PaymentTransaction.status=FAILED` | > 20 % sur 15 min |
  - `lib/observability/alert.ts::sendOpsAlert(severity, title, context)` → POST vers `OPS_ALERT_WEBHOOK_URL` (non bloquant, best-effort).
  - **Astreinte** : `docs/operations/incident-runbook.md` — qui est joignable, procédure par type d'incident (fuite de secret, divergence comptable, indisponibilité base, fraude massive), matrice de gravité.
- **Effort** : **M**.
- **Livrable associé** : `PRODUCTION_HARDENING_REPORT.md`.

---

## P1 — BACKUP / DISASTER RECOVERY

### P1.16 — Restauration réelle testée

- **Problème (#17, #18, #37)** : DR jamais testé, pas de copie hors-hébergeur, bucket KYC hors périmètre.
- **Fichiers** : `scripts/db-backup.mjs` (étendre : bucket + upload hors-hébergeur), nouveau `scripts/db-restore.mjs`, `scripts/backup-verify.mjs`, `.github/workflows/backup.yml` (nouveau, quotidien), `docs/audit/DISASTER_RECOVERY_TEST_REPORT.md`, `docs/operations/backup-recovery.md` (mise à jour avec les chiffres réels).
- **Dépendances** : P1.9 (environnement neuf pour le test), P1.10 (secrets du stockage de sauvegarde).
- **Modification** :
  1. **Sauvegarde automatisée** : workflow quotidien → `pg_dump` (format custom) + export du bucket KYC (Supabase Storage API) → chiffrement (`age` ou `gpg`, clé dédiée) → upload vers un **stockage tiers** (Backblaze B2 / Cloudflare R2 / S3 — hors Vercel/Supabase). Rétention 30 j (lifecycle du bucket de sauvegarde).
  2. `scripts/backup-verify.mjs` : télécharge la dernière sauvegarde, la restaure dans une base jetable, `prisma migrate status` + comptages de sanité (`SELECT count(*)` sur les tables clés) → rapport. Exécuté hebdo.
  3. **Test DR complet** (une fois, consigné) : provisionner un environnement **neuf** (base + bucket vides), restaurer la dernière sauvegarde base + bucket, appliquer `migrate deploy`, lancer `smoke.mjs`, vérifier l'intégrité (réconciliation ledger = 0, quelques comptes de test se connectent, un document KYC s'ouvre). **Chronométrer** : RTO réel = temps total ; RPO réel = âge de la sauvegarde restaurée.
  4. `DISASTER_RECOVERY_TEST_REPORT.md` : étapes exécutées, horodatages, RTO/RPO mesurés, problèmes rencontrés, corrections.
- **Règle** : DR **non terminé** tant que ce test réel n'a pas tourné et n'est pas documenté.
- **Effort** : **L** (provisionnement + exécution + doc).
- **Livrable associé** : `DISASTER_RECOVERY_TEST_REPORT.md`.

---

## P1 — KYC / LCB-FT

### P1.17 — Préparer l'intégration réelle (sous feature flags)

- **Problème (#5)** : liveness absente, screening = stub.
- **Fichiers** : `lib/kyc/screening.ts` (interface + adaptateur stub conservé), nouveau `lib/kyc/idv/` (interface `IdvProvider` + adaptateur simulé + emplacement pour le réel), `lib/kyc/limits.ts` (calage BCEAO documenté), `app/api/v1/kyc/**` (branchement derrière flag), `app/(admin)/kyc/**` (procédure de revue/escalade), nouveau `docs/audit/KYC_COMPLIANCE_READINESS.md`, `docs/compliance/aml-procedures.md` (nouveau).
- **Dépendances** : choix du prestataire (démarche externe).
- **Modification** :
  1. **Interface `IdvProvider`** (miroir de `lib/payments/` / `lib/delivery/`) : `verifyIdentity(docs, selfie) → { livenessScore, documentAuthenticity, faceMatch, decision }`. Adaptateur `SimulatedIdvProvider` (conserve le comportement actuel, `simulated: true`). Emplacement prêt pour un adaptateur réel (Onfido / Smile ID / IDEMIA…).
  2. **Screening** : `screenName` reçoit une interface `SanctionsProvider` ; stub local conservé pour le dev ; adaptateur réel (Dow Jones / ComplyAdvantage / OpenSanctions) derrière `KYC_SCREENING_PROVIDER`.
  3. **Feature flags** : `KYC_IDV_PROVIDER` (`simulated` | `<réel>`), `KYC_SCREENING_PROVIDER`. Tant que non validé → `simulated`, et **le Trust Center / l'écran KYC affichent explicitement « vérification simulée — non opposable »** (déjà le cas pour le mode démo — renforcer).
  4. **Procédures** (`docs/compliance/aml-procedures.md`) : revue KYC (qui, délais, critères), **escalade** (cas douteux → conformité), **déclaration de soupçon** (interlocuteur CENTIF, format, délais), gel des avoirs (procédure + qui déclenche).
  5. **Plafonds** : `lib/kyc/limits.ts` — documenter la source réglementaire cible pour chaque palier (à confirmer avec un conseil), garder les valeurs conservatrices actuelles en attendant.
- **Règle** : ne **jamais** présenter le KYC simulé comme une vérification réglementaire. Les intégrations restent sous flag jusqu'à validation.
- **Risques** : quasi nul (on ajoute des interfaces, on ne retire rien ; le stub reste le défaut).
- **Effort** : **M** (code) + externe (contrats prestataires).
- **Livrable associé** : `KYC_COMPLIANCE_READINESS.md`.

---

## P1 — PROTECTION DES DONNÉES

### P1.18 — Fichiers KYC

- **Problème (#6, #23)** : fallback data-URI (binaires en base), pas d'antivirus, pas de ré-encodage, EXIF.
- **Fichiers** : `lib/storage/kyc-storage.ts`, `app/api/v1/kyc/documents/route.ts`, `lib/storage/supabase-storage.ts`, nouveau `lib/storage/image-sanitize.ts`, `lib/storage/scan.ts` (antivirus), schéma `KycDocument` (rendre `fileUrl` optionnel / retirer le data-URI) → **migration**, `prisma/seed.ts`, `docs/audit/PRODUCTION_HARDENING_REPORT.md`.
- **Dépendances** : P0.0, P1.10 (secrets du bucket).
- **Modification** :
  1. **Bucket obligatoire** : en `NODE_ENV === 'production'`, si `kycStorageEnabled()` est faux → **refuser l'upload KYC** (`503` + log), pas de fallback data-URI. Migrer les data-URI existants (script ponctuel) vers le bucket, puis `KycDocument.fileUrl` ne contient plus jamais de data-URI.
  2. **Ré-encodage serveur** : `image-sanitize.ts` — décoder l'image (sharp ou l'API Canvas côté serveur via `@napi-rs/canvas`), **ré-encoder** en JPEG/PNG propre (strip EXIF/ICC/métadonnées, aplatir), rejeter si le décodage échoue (polyglotte). Appliqué **avant** le stockage, pour KYC **et** pièces jointes ticket **et** images marketplace.
  3. **Antivirus** : `scan.ts` — soit ClamAV (conteneur/service), soit un service d'analyse (VirusTotal API / Cloudmersive) derrière `AV_SCAN_PROVIDER`. Bloquant sur KYC et pièces jointes ; asynchrone tolérable sur marketplace (quarantaine).
  4. **Limites d'upload** : rate limit dédié KYC déjà là ; ajouter un plafond « N pièces / 24 h / utilisateur » et un plafond de taille cumulée.
  5. **URLs signées** : déjà 5 min — vérifier qu'aucune URL de bucket n'est jamais exposée non signée (audit des sérialiseurs).
  6. **Chiffrement** : le bucket Supabase est chiffré au repos (hébergeur). Pour un niveau supplémentaire, chiffrer côté application les pièces KYC avant upload (clé dédiée via P1.10) — **optionnel Phase 0**, à décider selon exigence du conseil.
- **Risques** : `sharp`/`@napi-rs/canvas` sur Vercel (binaires natifs) — `sharp` est supporté par Vercel. Tester le build. Le ré-encodage peut dégrader légèrement la lisibilité d'un document → garder une qualité JPEG haute (95).
- **Tests** : `test/integration/upload-sanitize.itest.ts` — image avec EXIF → EXIF absente après stockage ; fichier non-image renommé `.jpg` → rejeté ; (mock) fichier "infecté" → rejeté ; prod sans bucket → 503.
- **Effort** : **M–L**.
- **Livrable associé** : `PRODUCTION_HARDENING_REPORT.md`.

### P1.19 — Données personnelles (documentation)

- **Problème (#6)** : pas de cartographie sous-traitants / DPA / registre.
- **Fichiers** : `docs/compliance/data-processing-register.md` (nouveau), `docs/compliance/subprocessors.md` (nouveau), `docs/compliance/matrix.md` (mise à jour §2).
- **Dépendances** : aucune (documentation).
- **Modification** :
  1. **Registre des traitements** : finalité, base légale, catégories de données, durées (déjà dans `matrix.md` §9 — formaliser), destinataires.
  2. **Sous-traitants** : Vercel (hébergement), Supabase (base + storage), Upstash (rate limit), Resend (e-mail), Sentry (observabilité), le prestataire IDV, le prestataire de screening, l'opérateur Mobile Money, le stockage de sauvegarde → pour chacun : rôle, données transmises, localisation, **DPA signé (O/N)**, clause de transfert hors zone.
  3. **Transferts internationaux** : Supabase `eu-west-1`, Vercel (régions), Sentry (US ?) → documenter la base juridique (CCT / adequacy).
  4. **Responsabilités** : DPO à désigner (nom + contact dans les CGU), responsable de traitement = l'entité (P0 juridique).
- **Effort** : **S** (rédaction, mais nécessite les infos des contrats).
- **Livrable associé** : intégré à `KYC_COMPLIANCE_READINESS.md` + `matrix.md`.

---

## P2 — TESTS DE SÉCURITÉ

### P2.20 — SAST / DAST / IDOR / RBAC / concurrence / invariants

- **Problème (#33, #34)** : aucun test de sécurité, pas de scan en CI.
- **Fichiers** : `.github/workflows/security.yml` (nouveau), `test/security/` (nouveau répertoire), `e2e/authz.spec.ts` (nouveau), `test/integration/invariants.itest.ts` (nouveau), `docs/audit/SECURITY_REMEDIATION_REPORT.md`.
- **Dépendances** : P0.1 (audit CI), P0.2 (session), P0.4 (idempotence).
- **Modification** :
  1. **CI `security.yml`** :
     - `npm audit --audit-level=high` (déjà en P0.1, consolidé ici).
     - **SAST** : `github/codeql-action` (JS/TS) — analyse statique, alertes de sécurité.
     - **Secrets scanning** : `gitleaks` (historique + diff PR).
     - **Dependency scanning** : Dependabot (P0.1) + `osv-scanner`.
     - **DAST** (léger) : OWASP ZAP baseline scan contre l'URL de staging (non bloquant d'abord, puis bloquant sur les alertes hautes).
  2. **Tests d'autorisation automatisés** — `e2e/authz.spec.ts` et/ou `test/integration/authz.itest.ts`, scénarios explicites :

     | Scénario | Attendu |
     |---|---|
     | Utilisateur A → `GET /api/v1/wallet` avec l'id de B / `GET /tontine/<id de B>` | 403 / 404, jamais les données de B |
     | A → `POST /wallet/transfer` en usurpant le `fromWalletId` de B | 403 |
     | A → `POST /tontine/<tontine de B>/contribute` sans être membre | 403 |
     | A → `POST /marketplace/deliveries` sur une commande de B | 403 |
     | A (rôle USER) → toute route `/api/v1/admin/*` | 403 |
     | A → rejoue un webhook signé déjà traité | `duplicate`, wallet inchangé |
     | A → rejoue `POST /marketplace/[id]/order` avec la même `Idempotency-Key` | 1 commande, 1 débit |
     | A → `POST /wallet/transfer` 2× en parallèle (même `Idempotency-Key`) | 1 débit |
     | A → présente un access token dont la session est révoquée | 401 |
     | A → présente un refresh token déjà tourné | 401 + famille révoquée |
     | A → requête POST cross-origin (Origin ≠ app) | 403 (CSRF) |

  3. **Tests d'invariants comptables** — `test/integration/invariants.itest.ts` : après une séquence aléatoire longue (N transferts, cotisations, achats wallet + tontine, livraisons, remboursements, annulations), vérifier :
     - `∀ wallet: Σ(ledger) == balance`
     - `∀ séquestre tontine: solde == escrowExpectedHeld`
     - séquestre marketplace: `solde == Σ(commandes PENDING_SETTLEMENT)`
     - `Σ(tous soldes) == Σ(dépôts) − Σ(retraits)`
     - aucune écriture ledger sans `idempotencyKey`
     - aucun solde négatif
  4. **Fuzzing ciblé** : les schémas Zod des routes financières (montants, id, clés d'idempotence) avec `fast-check` — valeurs limites, unicode, très grands nombres, injections.
  5. **Pentest externe** : cadrer et commander (voir action #19 de l'audit) — auth, IDOR sur toutes les routes `/api/v1/*`, logique métier transferts/tontines/séquestres, webhooks. Corriger les findings avant ouverture pilote.
- **Effort** : **L**.
- **Livrable associé** : `SECURITY_REMEDIATION_REPORT.md`.

---

## Séquencement recommandé

```
P0.0  Socle migrations ─────────────────────────────┐ (prérequis de tout changement de schéma)
                                                     │
P0.1  Bump Next + fix vulns + audit CI ──────────────┤ (rapide, débloque la confiance dans le middleware)
                                                     │
P0.3  Webhooks (refus prod sans secret + journal) ───┤ (petit, indépendant)
P0.5  Config prod (guards, HSTS, CSP report-only) ───┤ (petit, en parallèle)
                                                     │
P0.4  Marketplace idempotence + concurrence ─────────┤ (moyen)
P1.7  Concurrence tontines + verrou cron ────────────┤ (moyen, même veine que P0.4)
                                                     │
P0.2  Sessions HttpOnly + révocation + reuse detect ─┤ (LE gros morceau — focus dédié)
                                                     │
P1.9  Staging + pipeline de déploiement ─────────────┤ (débloque le test réel de tout le reste)
P1.10 Secrets (coffre-fort, séparation, rotation) ───┤
P1.12 Redis prod + rate limit edge ─────────────────┤
P1.11 Pool PostgreSQL + test de charge (sur staging)─┤
                                                     │
P1.13 APM (Sentry) ─────────────────────────────────┤
P1.14 Request-id / correlation ─────────────────────┤
P1.15 Alerting + runbook d'incident ───────────────┤
                                                     │
P1.6  Réconciliation Ledger (+ alertes) ────────────┤
                                                     │
P1.16 Sauvegardes hors-hébergeur + TEST DR réel ────┤
                                                     │
P1.18 Fichiers KYC (bucket obligatoire, sanitize, AV)┤
P1.17 KYC/LCB-FT : interfaces + procédures (flags) ─┤
P1.19 Registre traitements + sous-traitants (doc) ──┤
                                                     │
P2.20 Tests de sécurité (SAST/DAST/IDOR/invariants) ─┘ (transverse, s'enrichit à chaque item)
CSP  Passage de report-only → enforce (fin de P0.5) ─┘
```

**En parallèle (démarches externes, non bloquées par le code)** : constitution de l'entité + statut réglementaire (action #1) · contrats opérateurs paiement · choix + contrat prestataire IDV + screening · validation juridique des CGU · pentest externe.

---

## Méthode par changement (règle absolue de l'audit)

Pour **chaque** modification, dans cet ordre, documenté au fil de l'eau :

1. Problème (référence audit) — 2. Fichiers concernés — 3. Dépendances — 4. Modification proposée — 5. Risques de régression + mitigations — 6. Implémentation — 7. `tsc` + `lint` + `vitest` + `test:integration` + `test:e2e:isolated` — 8. `npm run build` (+ smoke prod après déploiement staging) — 9. Entrée `CHANGELOG.md` + section du rapport concerné.

**Aucun refactoring non nécessaire.** Un commit = un problème traité + ses tests.

---

## Livrables de fin de Phase 0

| Fichier | Contenu | Alimenté par |
|---|---|---|
| `PRODUCTION_HARDENING_REPORT.md` | Synthèse de tout ce qui a été durci, avant/après par élément | P0.0, P0.4, P0.5, P1.6, P1.7, P1.11–P1.16, P1.18 |
| `SECURITY_REMEDIATION_REPORT.md` | Vulns corrigées, session, webhooks, CSP, tests de sécurité, résultat pentest | P0.1, P0.2, P0.3, P0.4, P1.10, P2.20 |
| `DATABASE_MIGRATION_PLAN.md` | Passage à `prisma migrate`, procédure, rollback, règles | P0.0 |
| `STAGING_DEPLOYMENT_PLAN.md` | Environnement staging, pipeline, protections de branche | P1.9 |
| `DISASTER_RECOVERY_TEST_REPORT.md` | Test DR réel exécuté : étapes, RTO/RPO mesurés | P1.16 |
| `PAYMENT_READINESS_REPORT.md` | État des intégrations paiement, webhooks durcis, ce qui reste (contrats) | P0.3, + externe |
| `KYC_COMPLIANCE_READINESS.md` | Interfaces IDV/screening, procédures AML, plafonds, registre traitements | P1.17, P1.18, P1.19 |
| `CHANGELOG.md` | Mis à jour à chaque commit | tous |
| **`KESSIA_PRODUCTION_READINESS_V2.md`** | Nouvel audit : STATUS par élément + 9 scores + score global | tous |

**Critère de fin de Phase 0** : tous les éléments `CRITICAL` et les `NOT READY` réellement bloquants (webhooks, sessions, migrations, staging, DR testé, secrets, monitoring/alerting, KYC sous flags honnêtes) sont **corrigés et vérifiés**. KESSIA ne sera pas déclarée « prête pour un pilote » tant que `KESSIA_PRODUCTION_READINESS_V2.md` ne le montre pas — et **jamais « production-ready »** tant que les prérequis juridiques (action #1) ne sont pas levés.

---

*Plan établi le 10 septembre 2026 après analyse du dépôt au commit `a9d6388`. Aucune modification de code n'a été effectuée à ce stade.*
