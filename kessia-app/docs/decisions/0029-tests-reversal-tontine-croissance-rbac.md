# ADR 0029 — Tests : reversal, tontine Croissance, RBAC route, i18n core (§49/§51)

**Statut :** accepté · **Date :** 2026-08-31

## Contexte
L'audit du 31 août (`docs/progress/audit-2026-08-31.md`) listait comme action
n°1 l'extension de la couverture de tests sur les cas manquants du rapport :
reversal de transfert, tontine Croissance, RBAC au niveau route, et le cœur
i18n (aucun test direct).

## Décision

### Tests unitaires
- **`lib/i18n/core.test.ts`** (7 tests) — `interpolate` (placeholders présents /
  absents), `resolve` (chaînes seulement), `makeTranslate` (valeur fr, valeur
  en pour la prose serveur `srv*`, interpolation, chaîne de repli
  locale → fr → clé), et cohérence `en ⊆ fr` sur toutes les clés `srv*`
  (> 50 clés, non vides). Couvre le socle partagé client/serveur (ADR 0027).

### Tests d'intégration (`*.itest.ts`, base réelle)
- **`test/integration/transfer-reversal.itest.ts`** (2 tests) —
  `POST /api/v1/wallet/transfer` : quand le crédit du destinataire échoue
  (wallet verrouillé), le débit de l'expéditeur est annulé (`REVERSAL` /
  `REV-<ref>`), le solde est rétabli, la réponse est 500, l'audit
  `wallet.transfer_failed` porte `reversed: true`. + un transfert nominal
  sans reversal. Token minté via `signAccessToken`.
- **`test/integration/tontine-growth.itest.ts`** (1 test) — tontine `GROWTH` :
  N tours **sans versement**, puis restitution de `totalContributed` à chaque
  membre au dernier tour (`TPAYOUT-<id>-final-<memberId>`), net = 0 sur le
  cycle, idempotent (rejeu ne restitue pas deux fois). 2 membres / 2 tours
  (latence pooler — timeout à 90 s).
- **`test/integration/admin-rbac.itest.ts`** (3 tests) — un token `USER` reçoit
  **403** sur les 10 familles `/admin/*` ; sans token, **401** ; un token
  `SUPER_ADMIN` n'est jamais bloqué (401/403) par la garde RBAC.

## Conséquences
- ✅ **119 tests unitaires** (+7) + **23 tests d'intégration** (+6) + 36 E2E.
- ✅ `tsc` + `lint` (0 warning) + `vitest` (119) + `test:integration` (23) +
  `build` + `playwright` (36) + `db:seed` au vert.
- §49 / §51 rapprochés de « conforme » : le reversal, la tontine Croissance et
  le RBAC au niveau route sont désormais couverts par des tests automatisés.
- ⏭️ Reste (audit) : i18n back-office / `/legal`, PDF serveur, cache offline,
  KPI §54.
