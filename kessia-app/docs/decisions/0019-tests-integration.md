# ADR 0019 — Tests d'intégration (§49)

**Statut :** accepté · **Date :** 2026-08-29

## Contexte
§49 restait « Partiel » avec une réserve explicite : **tests d'intégration à
faire**. La couverture existante saute directement des tests unitaires
(fonctions pures, 106) aux E2E navigateur (Playwright, 36) — rien ne teste les
**handlers de route et les services de domaine contre une vraie base** :
atomicité du ledger, idempotence (`Idempotency-Key`, webhooks), plafonds KYC,
cycle de tontine.

## Décision
Ajouter une suite d'intégration **séparée** de la suite unitaire.

### Infrastructure
- `vitest.integration.config.ts` : `include: ['**/*.itest.ts']`,
  `fileParallelism: false` (base partagée), `testTimeout: 30 s`,
  `setupFiles: ['test/integration/env-setup.ts']`.
- `test/integration/env-setup.ts` : charge `.env` puis `.env.local` dans
  `process.env` **avant** l'import des modules applicatifs (pas de dépendance
  `dotenv`, comme `scripts/db-backup.mjs`) ; force `E2E_RATE_LIMIT_BYPASS=1` ;
  laisse Vitest fixer `NODE_ENV=test` (silence les logs de requêtes Prisma).
- `test/integration/helpers.ts` : `makeUser()` (utilisateur + wallet jetables,
  téléphone `+22899…` hors plage de seed, nom = `itest_<ts>_<uuid>`),
  `cleanup()` (suppression dans l'ordre des dépendances, tolérante aux FK
  résiduelles), `settle()` (laisse les tâches `notify` / `recordAudit`
  « fire-and-forget » se poser avant le nettoyage).
- Script `npm run test:integration`. La suite unitaire (`npm test`,
  `include: ['**/*.test.ts']`) ne ramasse **pas** les `*.itest.ts` — elle
  reste rapide et sans base.
- Workflow `.github/workflows/integration.yml` : Postgres 16 éphémère →
  `prisma generate` + `db push` + `db:seed` → `npm run test:integration`.

### Couverture (17 tests, 5 fichiers)
| Fichier | Vérifie |
|---|---|
| `ledger.service.itest.ts` | DEBIT réduit le solde et crée **une** entrée ; rejouer la clé d'idempotence ne double rien ; solde insuffisant → échec sans effet ; wallet verrouillé → refus |
| `payments-settle.itest.ts` | `settlePendingPayment` : COMPLETED crédite une fois (clé `PAYTX_<id>`) ; rejeu → `ALREADY_SETTLED` sans double crédit ; FAILED sans écriture ledger ; référence inconnue → `NOT_FOUND` |
| `tontine-orchestrator.itest.ts` | Type Projet : `activateTontine` crée les cotisations du tour 1 ; `checkAndAdvanceRound` verse la cagnotte à l'organisateur et clôture ; **rejouer ne verse pas deux fois** (`TPAYOUT-<id>-1` unique) ; versement bloqué tant que toutes les cotisations ne sont pas réglées |
| `kyc-limits.itest.ts` | `checkOutboundLimit` agrège les sorties du mois, calcule le restant ; refuse au-dessus du plafond par opération / mensuel ; palier 2 (vérifié niveau 2) débloqué |
| `register-route.itest.ts` | `POST /api/v1/auth/register` : compte + profil + wallet créés dans **une transaction**, `termsAcceptedVersion` = `LEGAL_VERSION`, audit `auth.register` ; numéro déjà pris → 409 (pas de second compte) ; consentement manquant → 400 |

## Conséquences
- ✅ §49 avance : la couche d'intégration existe et tourne en CI.
- ✅ `tsc` + `lint` (0 warning) + `vitest` unitaire (106) + **`test:integration`
  (17)** + `build` + `playwright` (36) au vert. Reseed OK.
- La suite d'intégration est **lente** (~2–3 min) — latence réseau par requête
  vers la base ; elle a son propre workflow, pas dans le chemin critique de la
  CI unitaire.
- ⏭️ À étendre : reversal de transfert sur échec de crédit, restitution
  d'une tontine Croissance, RBAC au niveau route (JWT signé), webhook HMAC
  bout en bout.
