# ADR 0014 — Stockage KYC hors base, rate limiting distribué, ordonnanceur du tick tontine

**Statut :** accepté · **Date :** 2026-08-29

## Contexte
Trois bloquants d'infrastructure identifiés dans la matrice de conformité
(§7 de la synthèse) et réalisables **en code** :
1. Documents KYC stockés en data-URI dans PostgreSQL (bloat + pas de bucket
   dédié).
2. Rate limiting en mémoire → inefficace en serverless multi-instance.
3. `POST /api/v1/cron/tontine-tick` prêt mais aucun ordonnanceur ne l'appelle.

Chaque solution **dégrade proprement** : sans configuration, le comportement
MVP actuel est conservé (tests inchangés).

## Décisions

### 1. Stockage des pièces KYC — Supabase Storage
- `lib/storage/supabase-storage.ts` : accès **REST** (pas de SDK) à Supabase
  Storage avec la clé service — `putObject`, `signObjectUrl`, `removeObjects`.
  `storageConfigured()` = `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- `lib/storage/kyc-storage.ts` : wrapper KYC — bucket `SUPABASE_KYC_BUCKET`
  (privé), chemin `{userId}/{docId}.{ext}`, URL signées **5 minutes**.
- Schéma : `KycDocument` += `storageKey String?`, `mimeType String?`.
  `fileUrl` devient un **repli** (data-URI) utilisé seulement quand le
  stockage n'est pas configuré ou que l'upload échoue.
- `POST /api/v1/kyc/documents` : si le stockage est actif → upload puis
  `storageKey`, `fileUrl` vide ; sinon data-URI comme avant. Remplacement /
  suppression d'une pièce → nettoyage best-effort du bucket.
- `GET /api/v1/admin/kyc/[id]` (conformité) : renvoie une **URL signée
  courte** quand `storageKey` est présent, jamais le contenu brut.
- Reste : nettoyage du bucket lors d'une suppression RGPD (procédure manuelle
  encadrée — `docs/operations/backup-recovery.md`).

### 2. Rate limiting — Upstash Redis
- `lib/security/rate-limit.ts` : `enforceRateLimit()` devient **asynchrone**
  (tous les appels — 15 routes — passent en `await`). `checkRateLimit()`
  choisit à l'exécution :
  - **Upstash** (`@upstash/ratelimit` sliding window, préfixe `kessia:rl`) si
    `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` sont définis —
    compteur **partagé** entre instances ;
  - sinon **compteur mémoire** (mono-instance).
- Instances `Ratelimit` mises en cache par `(limit, windowMs)`. Toute erreur
  Upstash → repli mémoire (le rate limiting ne doit jamais casser une route).
- `E2E_RATE_LIMIT_BYPASS=1` inchangé (tests). `rateLimit()` (sync) conservé
  pour la voie mémoire et les tests unitaires.

### 3. Ordonnanceur — `cron/tontine-tick`
- La route accepte désormais **`GET` et `POST`** (même logique, même auth par
  `CRON_SECRET`). `GET` pour Vercel Cron (n'émet que des GET, avec
  `Authorization: Bearer $CRON_SECRET` automatique) ; `POST` pour GitHub
  Actions / curl.
- `.github/workflows/cron.yml` : planifié toutes les heures (`7 * * * *`),
  `curl -X POST` vers `CRON_TICK_URL` avec `x-cron-secret`. Ignoré proprement
  tant que les secrets `CRON_TICK_URL` / `CRON_SECRET` ne sont pas définis.
- `kessia-app/vercel.json` : entrée `crons` équivalente pour un déploiement
  Vercel.

## Conséquences
- ✅ Ferme le bloquant #6 (stockage KYC hors base) et une partie du #7
  (rate-limit distribué, ordonnanceur). L'endpoint `/api/metrics` (ADR 0013)
  couvre l'autre partie du #7 (à scraper par un APM).
- ✅ Zéro régression : sans les variables d'environnement, tout se comporte
  comme avant. `tsc` + `lint` + `vitest` (93) + `build` + `playwright` (30)
  au vert.
- ⏭️ Restent au titre du #7 : APM branché, gestionnaire de secrets,
  rétention 30 j + copie de sauvegarde hors-hébergeur + premier test DR
  consigné (`docs/operations/backup-recovery.md`).
