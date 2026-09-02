# ADR 0004 — Journal d'audit & rate limiting

**Statut :** accepté · **Date :** 2026-08-28

## Contexte
Cahier des charges §31 (rate limiting, audit log), §47 (observabilité), §51 (DoD : logs), MASTER #15 (« toute action critique doit être auditable »). Les dépendances `@upstash/ratelimit` + `@upstash/redis` sont installées mais l'instance Redis n'est pas configurée.

## Décision

### Audit (`lib/audit/audit.service.ts`)
- `recordAudit({ userId, action, entity, entityId, before?, after?, metadata?, request })` écrit dans `AuditLog`.
- **Non bloquant** : un échec d'audit est loggé mais ne casse jamais l'action métier (`void recordAudit(...)`).
- **Jamais de données sensibles** dans `metadata` : pas de mot de passe, pas de code OTP, pas de contenu de document KYC. Montants et identifiants OK.
- Actions instrumentées : `auth.login`, `auth.login_failed`, `auth.register`, `auth.register_verified`, `auth.logout`, `wallet.deposit`, `wallet.transfer`, `wallet.transfer_failed`, `tontine.create`, `tontine.contribute`, `kyc.case_opened`, `kyc.submit_document`, `profile.update`, `support.ticket_created`.

### Rate limiting (`lib/security/rate-limit.ts`)
- Compteur **en mémoire** (Map), fenêtre glissante simple. `enforceRateLimit(request, name, { limit, windowMs, by? })` → 429 ou `null`.
- Clé = `name:<ip>` par défaut, ou `name:<userId>` pour les routes authentifiées (`by`).
- Limites : login 10/15 min · register 5/h · request-otp 8/15 min · verify-otp 15/15 min · wallet.transfer 10/min · wallet.deposit 15/min · kyc.document 20/10 min · ai.chat 30/min.
- `request-otp` conserve en plus son garde-fou base (3 OTP/min/numéro).

## Conséquences
- ✅ Traçabilité des actions critiques (§51) ; défense brute-force au-delà du lockout compte.
- ⚠️ **Le compteur en mémoire ne fonctionne pas en serverless multi-instance.** Production → brancher `@upstash/ratelimit` (renseigner `UPSTASH_REDIS_REST_URL/TOKEN`, remplacer l'implémentation interne de `rate-limit.ts` en gardant la signature).
- ⏭️ À faire : écran admin de consultation de l'audit (`GET /api/v1/admin/audit`), rétention/export, alertes (§32 anti-fraude).
