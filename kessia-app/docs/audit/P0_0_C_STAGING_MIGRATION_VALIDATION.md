---
title: "KESSIA — P0.0 / C : Staging Migration Validation"
date: "11 septembre 2026"
---

# C — Staging Migration Validation

**Objectif** : un vrai environnement staging isolé (projet Vercel séparé,
projet Supabase séparé, secrets séparés, aucune donnée réelle) démontrant
migration → application → smoke tests → fonctionnalités critiques.

**Verdict : C = NON VALIDÉ — infrastructure inexistante.** Ce n'est pas un
résultat de test qui a échoué : **l'environnement staging n'existe pas
encore**, et sa création (compte/dashboard Vercel + Supabase) dépasse ce
que cette session peut faire seule. Ce document explique précisément ce
qui a été préparé, ce qui manque, et l'action exacte requise — sans
qu'aucun secret ne soit demandé ou affiché ici.

---

## 1. Constat vérifié (pas supposé)

| Vérification | Résultat |
|---|---|
| `.github/workflows/staging.yml` | Existe, squelette fonctionnel, saute **toutes** ses étapes si `STAGING_DEPLOY_HOOK`/`STAGING_BASE_URL` (secrets GitHub) sont absents |
| Secrets GitHub `STAGING_DEPLOY_HOOK`/`STAGING_BASE_URL` | Non configurés (le workflow imprime « Secrets staging non configurés ») |
| `vercel whoami` | `Logged out` — aucune session Vercel active dans cet environnement |
| Projet Vercel dédié au staging | N'existe pas — un seul projet Vercel (`kessia`, production) |
| Projet Supabase dédié au staging | N'existe pas — une seule base partagée (démo = « prod ») |

Cela confirme un des findings CRITICAL de l'audit du 10/09 : « démo = prod,
même base ». C n'est donc pas un test à faire échouer/réussir dans l'état
actuel — c'est une **infrastructure à créer**, ce qui est explicitement le
contenu de l'étape P1.9 de ta propre feuille de route.

## 2. Ce que je ne peux pas faire moi-même, et pourquoi

- **Créer un projet Vercel** (nouveau projet ou nouvel environnement) :
  nécessite une action dans le dashboard Vercel (liaison du dépôt GitHub,
  choix du plan, etc.) — hors de portée des outils de cette session, quel
  que soit le token fourni.
- **Créer un projet Supabase** : nécessite un compte/dashboard Supabase
  (création de projet, choix de région, mot de passe de base) — idem.
- **Configurer des variables d'environnement/secrets** sur un projet
  Vercel ou des secrets sur le dépôt GitHub : action dashboard, jamais une
  valeur à faire transiter par le chat.

Je peux en revanche, une fois ces éléments créés par toi (ou une personne
avec l'accès), **piloter la suite** : déclencher le déploiement (deploy
hook), exécuter `migrate deploy` contre la base staging, lancer les smoke
tests, lire les logs, produire le rapport.

## 3. Ce qui a été préparé et prouvé en amont (pour que C soit rapide une fois l'infra créée)

### 3.1 Smoke tests enrichis — testés en conditions quasi réelles

`scripts/smoke.mjs` couvrait déjà santé, accueil, login, Wallet, Tontines.
Ajouté pour cette validation :

- `GET /api/v1/marketplace → 200` (Marketplace, catalogue public)
- `GET /api/v1/admin/users` sans jeton → **401**, puis avec le compte de
  smoke (non-admin) → **403** (RBAC réellement appliqué — pas juste
  « la route répond »)
- `GET /api/v1/wallet/transactions → 200` (Ledger, historique)

**Testé réellement** : application construite et démarrée (`next start`)
contre la base PostgreSQL 16 locale jetable de la validation B (fraîchement
`migrate deploy` + `db:seed`) :

```
$ SMOKE_BASE_URL=http://localhost:3099 SMOKE_PHONE=+22890000001 SMOKE_PASSWORD=*** node scripts/smoke.mjs
  ok   GET /api/health → 200 ok
  ok   GET / → 200
  ok   GET /api/v1/marketplace → 200
  ok   GET /api/v1/admin/users sans jeton → 401
  ok   POST /api/v1/auth/login → token
  ok   GET /api/v1/wallet → 200 (Wallet)
  ok   GET /api/v1/wallet/transactions → 200 (Ledger)
  ok   GET /api/v1/tontine → 200 (Tontines)
  ok   GET /api/v1/admin/users avec jeton non-admin → 403

✅ Smoke tests OK
```

9/9. C'est la preuve que **la chaîne migration → application → parcours
critique fonctionne**, indépendamment de l'endroit où l'app tourne
(local aujourd'hui, Vercel staging demain — le code exécuté est le même).
Il ne manque que l'infrastructure cloud pour rejouer exactement cette
séquence en staging.

### 3.2 Ce qu'il restera à ajouter à `smoke.mjs` une fois le staging réel accessible

- Une vérification AuditLog directe (aujourd'hui indirecte via 401/403 —
  un contrôle applicatif RBAC est déjà un signal fort, mais une lecture de
  `GET /api/v1/admin/…` avec un vrai jeton admin de staging confirmerait
  la présence d'écritures d'audit) — nécessite un compte admin de test en
  staging, à créer avec les données de seed, jamais un vrai compte.
- Un aller-retour Marketplace authentifié (créer un article, le retrouver)
  si jugé utile — actuellement volontairement minimal pour rester un
  smoke test rapide, pas une suite E2E complète (déjà couverte par
  `test:e2e:isolated`, prouvée en B).

## 4. Architecture cible (rappel, inchangée par rapport à ta demande)

```
KESSIA repository → GitHub Actions → Build/Tests → Vercel STAGING → Supabase STAGING → prisma migrate deploy → Smoke tests
```

**Décision actée** : C n'est pas reporté à P1.9. Reste néanmoins vrai : la
**création** des comptes/projets Vercel et Supabase est une action de
dashboard que cette session ne peut pas exécuter elle-même — ce que je
peux faire, et qui est fait ci-dessous, c'est préparer entièrement le
code/CI qui pilotera cette infrastructure dès qu'elle existe.

## 5. `staging.yml` complété — migration réelle avant déploiement

Le squelette existant ne faisait que déclencher le déploiement puis lancer
les smoke tests — **aucune migration n'était exécutée sur la base staging**.
Ajouté : un job `migrate` (avant `deploy`, dont il est une dépendance
`needs:`) qui applique `prisma migrate deploy` sur `STAGING_DATABASE_URL`,
avec :

- une garde anti-production dédiée (refuse si l'URL contient la référence
  du projet Supabase de **production**, `uwvnarmojdbutbunzqww` — testée,
  cf. §6) ;
- `prisma migrate status` explicite après coup ;
- aucun `continue-on-error`/`|| true` : si la migration échoue, `deploy`
  (donc le déclenchement Vercel + les smoke tests) **ne se lance pas** ;
- portée à un **GitHub Environment** dédié `staging` (secrets scopés,
  possibilité d'ajouter des règles de protection plus tard) ;
- `permissions: contents: read` au niveau du workflow (moindre privilège
  — ce pipeline n'écrit jamais dans le dépôt).

## 6. Garde anti-production — testée

| URL testée | Résultat |
|---|---|
| Référence prod réelle (`…uwvnarmojdbutbunzqww…`) | **BLOQUÉ** ✅ |
| Référence staging hypothétique (autre ref) | **AUTORISÉ** ✅ |

(Volontairement différente de la garde de A : celle de `integration.yml`/
`e2e.yml` bloque *tout* hôte Supabase, car ce job ne doit jamais en
toucher un seul ; celle-ci doit au contraire autoriser la base staging
tout en bloquant spécifiquement la production — d'où un test sur la
référence de projet, pas sur le nom d'hôte générique.)

## 7. CHECKLIST STAGING — ce qu'il reste à créer/configurer

Aucune valeur secrète n'est demandée ici — uniquement des **noms** à créer
dans les coffres prévus à cet effet.

### 7.1 Vercel

| Élément | Détail |
|---|---|
| **Projet** | Nouveau projet Vercel (ou nouvel environnement dédié sur le projet existant — un projet séparé est plus simple à isoler) |
| **Branche/environnement** | Relier au même dépôt GitHub ; le job `deploy` de `staging.yml` déclenche via un **Deploy Hook** (pas besoin de connecter Git directement sur `main` si tu préfères garder `main` = prod uniquement) |
| **Build** | Identique à la prod : Root Directory = `kessia-app`, Build Command = `prisma generate && next build` (déjà dans `package.json`, rien à changer) |
| **Variables d'environnement à créer** (Vercel → projet staging → Settings → Environment Variables) | `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_KYC_BUCKET`, `SUPABASE_TICKET_BUCKET`, `SUPABASE_AVATARS_BUCKET`, `SMS_PROVIDER=DEV` — voir détail §7.4 |
| **Deploy Hook** | Vercel → projet staging → Settings → Git → Deploy Hooks → créer un hook (nom libre, ex. "github-actions-staging") sur la branche de ton choix → copier son URL dans le secret GitHub `STAGING_DEPLOY_HOOK` (§7.3) |
| **Cron** | `vercel.json` (cron quotidien du tick tontine) ne s'exécute que sur l'environnement **Production** d'un projet Vercel — sur un projet staging séparé il restera inactif, ce qui est sans conséquence pour ces tests |

### 7.2 Supabase

| Élément | Détail |
|---|---|
| **Projet** | Nouveau projet Supabase, dédié staging |
| **Région recommandée** | La même que la production (`eu-west-1`) — cohérence de latence et évite les surprises liées au pooler (cf. ADR 0039) |
| **Migrations** | Aucune action manuelle — une fois `STAGING_DATABASE_URL` configuré (§7.3), le job `migrate` de `staging.yml` exécute `prisma migrate deploy` automatiquement à chaque run |
| **Stockage (Storage)** | Créer 3 buckets **privés** : ceux dont les noms seront donnés dans `SUPABASE_KYC_BUCKET`/`SUPABASE_TICKET_BUCKET`/`SUPABASE_AVATARS_BUCKET` (ex. reprendre les mêmes noms que la prod : `kyc-documents`, `ticket-attachments`, `avatars`) |
| **Bucket KYC** | `kyc-documents`, **privé** (pas de lecture publique) — sans lui, les uploads KYC échouent en 404 `NoSuchBucket` (comportement déjà observé et compris pendant la validation B) |
| **Clés à noter** (pour §7.1) | `Project URL`, `anon public key`, `service_role key` (Settings → API du projet staging) — à reporter dans les variables Vercel, jamais ici |
| **Connexion** | Noter la chaîne du pooler **session** (port 5432) pour les migrations (`STAGING_DATABASE_URL`, GitHub) et celle du pooler **transaction** (port 6543, `pgbouncer=true`) pour le runtime applicatif (`DATABASE_URL` sur Vercel) — même distinction que la prod, cf. `DATABASE_MIGRATION_PLAN.md` |

### 7.3 GitHub

| Secret/config | Où | Sert à | Comment vérifier sans révéler la valeur |
|---|---|---|---|
| Environment `staging` | Repo → Settings → Environments → New environment → nommer exactement `staging` | Scope les secrets ci-dessous à cet environnement plutôt qu'à tout le dépôt (déjà référencé par `environment: staging` dans `staging.yml`) | L'environnement apparaît dans Settings → Environments |
| `STAGING_DATABASE_URL` | Dans l'environnement `staging` → Environment secrets | Base Postgres staging, utilisée uniquement par le job `migrate` | Le job `migrate` du prochain run n'imprime plus « non configuré » |
| `STAGING_DEPLOY_HOOK` | Idem | Déclenche le déploiement Vercel staging | Le job `deploy` n'ignore plus l'étape « Trigger deploy » |
| `STAGING_BASE_URL` | Idem | URL publique du staging, utilisée par les smoke tests | L'étape « Smoke tests » s'exécute au lieu d'être sautée |
| `STAGING_SMOKE_PHONE` / `STAGING_SMOKE_PASSWORD` | Idem | Compte de **seed** (ex. `+22890000001` / le mot de passe commun du seed) — jamais un vrai utilisateur | Les checks authentifiés (Wallet/Ledger/Tontines/RBAC) du smoke test s'exécutent |
| Permissions du workflow | Déjà fait dans le code (`permissions: contents: read` dans `staging.yml`) | Moindre privilège — rien à configurer côté dashboard | Visible dans le fichier, appliqué automatiquement |

### 7.4 KESSIA (variables applicatives, à poser sur Vercel staging, cf. `.env.example`)

| Variable | Obligatoire pour C ? | Rôle |
|---|---|---|
| `DATABASE_URL` | **Oui** | Pooler **transaction** (port 6543) du projet Supabase staging — runtime applicatif |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | **Oui** | Valeurs dédiées, différentes de la prod |
| `SMS_PROVIDER=DEV` | **Oui** (pour les smoke tests) | Permet au parcours de connexion par mot de passe de fonctionner sans fournisseur SMS réel (déjà comment `smoke.mjs` teste — voir §3) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | **Oui** | Accès Storage (upload KYC/tickets/avatars) |
| `SUPABASE_KYC_BUCKET` / `SUPABASE_TICKET_BUCKET` / `SUPABASE_AVATARS_BUCKET` | **Oui** | Noms des buckets créés en §7.2 |
| `NODE_ENV` | Non — posé automatiquement par Vercel | — |
| `UPSTASH_REDIS_REST_URL`/`_TOKEN`, `CRON_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `MIARIDE_*`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `PUSH/SMS/EMAIL_PROVIDER_KEY` | Non | Optionnels — restent en mode simulé/absent sans bloquer les smoke tests de C |
| `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` | Non | Seulement si tu veux aussi tester l'inscription par OTP à la main sur staging — `smoke.mjs` n'en a pas besoin (connexion par mot de passe directe) |
| `E2E_RATE_LIMIT_BYPASS` | **À NE PAS poser** | Réservé aux runs E2E CI — ne doit jamais être une variable du déploiement staging lui-même |

## 8. Fichiers concernés

```
.github/workflows/staging.yml         (modifié — job `migrate`, environment, permissions)
scripts/smoke.mjs                     (déjà modifié/testé/poussé précédemment)
```

## 9. Commit

`.github/workflows/staging.yml` : commit local, **bloqué au push pour la
même raison que A** (scope `workflow` du token) — regroupé avec le diff de
A, voir hash communiqué dans la réponse à l'utilisateur.

## 10. Prochaine étape dès l'infrastructure prête

Dès que 7.1-7.3 sont en place (7.4 se déduit de 7.1) : un push sur `main`
(ou `workflow_dispatch`) déclenche `staging.yml` → `migrate` (schéma
staging à jour) → `deploy` (Vercel + smoke tests). Je lirai le run réel et
compléterai ce rapport avec les logs et le verdict C.
