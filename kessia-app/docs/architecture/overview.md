# Architecture — vue d'ensemble

## Couches (cahier §40)

```
app/(auth|dashboard|admin)/   Presentation  — React Server + Client Components
        │
hooks/ + store/               État client   — SWR (données serveur) + Zustand (auth, UI)
        │
lib/api/client.ts             Transport     — fetch authentifié, refresh 401, logout
        │
app/api/v1/*/route.ts         Application   — validation Zod, orchestration
        │
lib/ (auth, ledger, utils)    Domain        — règles métier (ledger, sessions)
        │
lib/db/prisma.ts              Infrastructure
        │
PostgreSQL (Supabase)
```

## Points clés

- **Le frontend ne modifie jamais un solde** (cahier §6.1). Toute écriture financière passe par `lib/ledger/ledger.service.ts` (`createLedgerEntry`) : transaction Prisma atomique, clé d'idempotence, `balanceBefore` / `balanceAfter`, refus des soldes négatifs.
- **Auth** : `lib/auth/session.ts` (JWT), `lib/auth/middleware.ts` (`withAuth`, `withAuthAndRole`, `assertOwnership`). Le `middleware.ts` racine ne fait que gater la présence du cookie — la vérification réelle est côté API.
- **Refresh token** : `lib/api/client.ts` intercepte les 401, appelle `/auth/refresh` (dédupliqué), rejoue une fois, sinon `logout()` + redirection.
- **Design tokens** : `app/globals.css` `:root`. Couleur signature `#B65A3A` (§36).

## Sécurité — état

| Contrôle | État |
|---|---|
| TLS | ✅ (hébergeur) |
| Tokens courts + refresh | ✅ |
| Lockout brute-force | ✅ (5 essais / 15 min) |
| Validation backend systématique | ✅ (Zod) |
| RBAC | 🟡 rôles + `withAuthAndRole` ; middleware sans rôle |
| Rate limiting | ❌ (`@upstash/*` installé, non câblé) |
| Audit log | ❌ (table `audit_logs` non alimentée) |
| MFA / biométrie | ❌ |
| Anti-fraude (§32) | ❌ |

## Intégrations à abstraire (interfaces dans `lib/`, non couplées)

- `PaymentProvider` (§6.3) — MobileMoney / Bank / QR / CashReceipt
- Fournisseur SMS (actuellement `console.log` en DEV)
- Fournisseur LLM pour KESSIA AI (actuellement moteur de règles)
- Stockage documents KYC (voir ADR 0003)
