# ADR 0006 — MFA, middleware RBAC edge & droits RGPD

**Statut :** accepté · **Date :** 2026-08-28

## Contexte
Lot de durcissement (ordre du cahier des charges §59 : Sécurité > Conformité).
Cahier des charges §31 (MFA, contrôle d'accès), §45 (back-office à accès
restreint), §4.5 « privacy by design », §46 (API REST versionnée), §59
(matrice de conformité).

## Décision

### 1. MFA / 2FA (TOTP)
- `lib/auth/twofactor.ts` : `otplib` (fenêtre ±1), secret base32, URI
  `otpauth://` pour QR, **8 codes de secours** au format `XXXX-XXXX` stockés
  **hachés SHA-256** (`User.twoFactorBackup: String[]`).
- Schéma : `User.twoFactorEnabled` / `twoFactorSecret` / `twoFactorBackup`.
- Flux d'activation : `POST /api/v1/auth/2fa {step:'setup'}` → secret + URI
  (non activé) ; `{step:'enable', code}` → vérifie le TOTP, active, renvoie les
  codes de secours **une seule fois**. `DELETE` avec un code valide → désactive.
- Flux de connexion : si `twoFactorEnabled`, `login` / `verify-otp` ne créent
  pas de session — ils renvoient `{ requires2fa: true, challengeToken }`
  (JWT court, 5 min, claim `twofa:true`). `POST /api/v1/auth/2fa/verify
  { challengeToken, code }` accepte un TOTP **ou** un code de secours (consommé)
  et émet enfin la session.
- UI : étape 2FA sur `/login` et `/verify-otp` ; gestion complète sur
  `/profile/security`.

### 2. Middleware edge durci (`middleware.ts`)
- Passe de « présence d'un cookie » à **vérification cryptographique** du JWT
  via `jose` (`jwtVerify`, compatible edge runtime — `jsonwebtoken` ne l'est
  pas).
- `readClaims()` → `{ sub, role } | null`. Routes protégées sans claims
  valides → `/login` (+ suppression du cookie mort). `/admin/*` sans rôle dans
  `ADMIN_ROLES` → `/home`. Routes d'auth avec claims valides → `/home`.
- Le front reste « jamais une frontière de sécurité » : chaque route API
  revalide indépendamment (`withAuth` / `withAuthAndRole`).

### 3. Droits RGPD (`/api/v1/profile/privacy`)
- Schéma : `User.dataExportRequestedAt` / `deletionRequestedAt`.
- `GET` → statut des demandes + consentements + périmètre de l'export.
- `POST {action:'export'}` → **archive JSON assemblée en synchrone** (identité,
  profil, wallet + ledger, paiements, tontines, business, KYC *métadonnées
  seulement*, notifications, tickets) + horodate la demande. Pièces jointes KYC
  (data-URI) **exclues**.
- `POST {action:'delete-request'}` → horodate + notifie + audit. Une seule
  demande active à la fois. `{action:'cancel-delete'}` l'annule.
- **L'effacement effectif reste manuel/encadré** : obligations de conservation
  AML & comptables (voir `docs/compliance/matrix.md` §9).
- UI : `/profile/privacy`.

### 4. Divers
- `lib/logger.ts` (`winston`) + `logApiError(route, err)` câblé dans ~40 routes.
- `GET /api/health` : sonde de disponibilité (ping DB inclus), 200 / 503.
- `GET|PATCH /api/v1/me` : alias de `/api/v1/profile` (§46).

## Conséquences
- ✅ MFA disponible ; `/admin/*` protégé au niveau edge par rôle ; droits
  d'accès / portabilité / effacement exposés ; matrice de conformité
  formalisée pour le conseil juridique.
- ⚠️ `JWT_SECRET` doit être identique côté signature (`jsonwebtoken`) et
  vérification (`jose`). Rotation du secret = invalidation de toutes les
  sessions.
- ⚠️ Export synchrone acceptable au volume MVP uniquement → passer à un job
  asynchrone + fichier signé en production.
- ⏭️ À faire (hors périmètre « MVP durci ») : liveness KYC / prestataire IDV,
  screening sanctions/PPE, job d'effacement, monitoring APM, gestionnaire de
  secrets. Suivi dans `docs/compliance/matrix.md`.
