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

## 5. Configuration manuelle requise — précise, sans secret dans le chat

| # | Élément | Où le configurer | Pourquoi | Environnement | Comment vérifier (sans afficher la valeur) |
|---|---|---|---|---|---|
| 1 | Nouveau projet Vercel (staging) | Dashboard Vercel → New Project, relier au même dépôt GitHub, **Root Directory = `kessia-app`** (piège déjà documenté), branche de déploiement dédiée (ex. `staging` ou preview) | Isoler le runtime staging de la prod (`kessia-dun.vercel.app`) | Vercel | `vercel project ls` (une fois authentifié) liste le nouveau projet |
| 2 | Nouveau projet Supabase (staging) | Dashboard Supabase → New Project | Base + Storage entièrement séparés de la démo/prod — condition explicite de ta demande | Supabase | Le projet apparaît dans le dashboard avec sa propre référence (`<ref>.supabase.co`), distincte de `uwvnarmojdbutbunzqww` |
| 3 | `DATABASE_URL` (staging) | Variables d'environnement du **projet Vercel staging** (pas celui de prod) | Pointer l'app staging sur la base Supabase staging, jamais sur la prod | Vercel staging | `GET /api/health` sur l'URL staging retourne `db: ok` après déploiement |
| 4 | `JWT_SECRET` / `JWT_REFRESH_SECRET` (staging) | Variables d'environnement du projet Vercel staging | Valeurs **différentes** de la prod — une session staging ne doit jamais être valide en prod ni inversement | Vercel staging | Un jeton émis par `/login` en staging est refusé par la prod (à vérifier une fois disponible) |
| 5 | `SUPABASE_SERVICE_ROLE_KEY` / buckets KYC/tickets/avatars (staging) | Variables d'environnement du projet Vercel staging, buckets créés dans le projet Supabase staging | Stockage entièrement séparé — condition explicite de ta demande | Supabase staging + Vercel staging | Un upload KYC en staging échoue si le bucket n'existe pas (`NoSuchBucket`) — signal déjà observé et compris pendant B |
| 6 | Secret GitHub `STAGING_DEPLOY_HOOK` | Repo GitHub → Settings → Secrets and variables → Actions | Permet à `staging.yml` de déclencher un déploiement Vercel staging sans exposer de token Vercel dans le workflow | GitHub Actions | `staging.yml` ne saute plus l'étape « Trigger deploy » (visible dans les logs du run, sans révéler le secret) |
| 7 | Secret GitHub `STAGING_BASE_URL` | Repo GitHub → Settings → Secrets and variables → Actions | URL publique du déploiement staging, utilisée par `smoke.mjs` | GitHub Actions | `staging.yml` exécute l'étape « Smoke tests » au lieu de la sauter |
| 8 | Secrets GitHub `STAGING_SMOKE_PHONE`/`STAGING_SMOKE_PASSWORD` | Repo GitHub → Settings → Secrets and variables → Actions | Compte de seed staging (jamais un vrai utilisateur) pour le parcours authentifié du smoke test | GitHub Actions | Les checks authentifiés (Wallet/Ledger/Tontines/RBAC) s'exécutent au lieu d'être ignorés |
| 9 | Baseline de migration sur la base staging neuve | Une fois la base Supabase staging créée : `npx prisma migrate deploy` (je peux l'exécuter moi-même dès que j'ai — via GitHub Actions déclenché par le deploy hook, ou si tu me donnes temporairement l'accès — un `DATABASE_URL` staging) | Une base neuve n'a pas encore de schéma | Supabase staging | `prisma migrate status` → « up to date » |

**Rien à coller dans le chat** : les valeurs des lignes 3-5 et 9 sont des
identifiants de connexion — elles se configurent uniquement dans les
coffres Vercel/Supabase/GitHub prévus à cet effet, jamais transmises ici.
Une fois 1-8 faits par toi, je peux exécuter 9 et la suite (déploiement,
`migrate deploy`, smoke tests, lecture des logs) et produire la suite de
ce rapport.

## 6. Décision proposée

Deux options, à ton choix :

- **Provisionner maintenant** (1-8 ci-dessus, ~20-30 min de configuration
  dashboard) → je complète immédiatement ce rapport avec un run staging
  réel.
- **Reporter C à P1.9** (sa place déjà prévue dans ta feuille de route) et
  considérer, pour clore P0.0, que **B (preuve mécanique complète sur base
  jetable) + A (mécanisme CI prouvé, ne manque que le push du diff) sont
  le maximum démontrable avant que l'infrastructure staging existe** — ce
  qui est cohérent avec la remarque de l'audit : la séparation staging est
  elle-même un prérequis (P1.9), pas un acquis de P0.0.

## 7. Fichiers concernés

```
scripts/smoke.mjs                     (modifié, testé, poussé)
.github/workflows/staging.yml         (inchangé — déjà prêt à activer dès que les secrets existent)
```

## 8. Commit

`smoke.mjs` : voir hash communiqué dans la réponse à l'utilisateur pour
cette étape.
