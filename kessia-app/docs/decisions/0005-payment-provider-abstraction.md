# ADR 0005 — Abstraction PaymentProvider

**Statut :** accepté · **Date :** 2026-08-28

## Contexte
Cahier des charges §6.3 : « ne pas coupler le code métier à un seul fournisseur ». Les dépôts/retraits doivent passer par une abstraction, avec des fournisseurs simulés en MVP, remplaçables par des intégrations réelles (opérateurs Mobile Money, banques) + sandbox.

## Décision

- **Interface** `PaymentProvider` (`lib/payments/types.ts`) : `supports(method, direction)`, `process(intent) → PaymentOutcome { status: COMPLETED|PENDING|FAILED, provider, simulated, externalRef }`.
- **Implémentations MVP** (`lib/payments/providers.ts`), toutes `simulated: true` sauf le QR interne :
  `SimulatedMobileMoneyProvider`, `SimulatedBankProvider` (dépôt → PENDING, retrait → COMPLETED), `CashReceiptProvider`, `QRProvider`.
- **Orchestration** `createPayment()` (`lib/payments/index.ts`) :
  1. `PaymentTransaction` (PROCESSING) →
  2. `provider.process()` →
  3. si `COMPLETED` → **`createLedgerEntry()`** (source de vérité du solde) →
  4. `PaymentTransaction` = COMPLETED / PENDING / FAILED, lien `ledgerEntryId`.
- **Modèle** `PaymentTransaction` + enums `PaymentMethod`, `PaymentDirection` (§42).
- **API** : `POST /api/v1/payments` (`{ direction, method, amount, account? }`), `GET /api/v1/payments`, `GET /api/v1/payments/[id]` (§43). `POST /api/v1/wallet/deposit` conservé comme raccourci INBOUND.

## Conséquences
- ✅ Le code métier ne connaît que l'interface. Brancher un vrai opérateur = une nouvelle classe + l'ajouter au registre.
- ✅ `simulated` remonte jusqu'à l'UI → aucun faux paiement présenté comme réel (MASTER #2).
- ⏭️ À faire : webhooks fournisseurs (§44) pour passer les `PENDING` → `COMPLETED` ; reversal sur échec de crédit ; `Card` provider.
