# ADR 0028 — i18n serveur : opportunités, insights, frais, trésorerie (§38)

**Statut :** accepté · **Date :** 2026-08-31

## Contexte
ADR 0027 a posé l'infra i18n serveur (`serverT()` via cookie) et l'a appliquée
au KESSIA Score, à l'ADN et au plan de croissance. Restait la prose générée
côté serveur sur les mêmes rails : Opportunity Engine, Smart Alerts / insights,
grille tarifaire, notes de trésorerie, mentions du Trust Center.

## Décision
Mêmes rails qu'ADR 0027, aucune architecture nouvelle.

- **`lib/i18n/server.ts`** : ajout de `serverNumber(n)` — formate un entier
  selon la locale de la requête (`12 500` / `12,500`), pour les montants
  interpolés dans la prose.
- **`lib/opportunities/engine.ts`** — les 8 types d'opportunités (titre +
  justification chiffrée + action). `.toLocaleString('fr-FR')` → `serverNumber()`.
  Renommage `for (const t of …)` → `pt` (ne pas masquer le traducteur `t`).
  Le libellé du type de tontine passe par `tontineType.<KEY>.label` (ADR 0022).
- **`lib/insights/insights.service.ts`** — les ~15 insights (KYC, cotisations
  à venir / en retard, solde bas, 2FA, Business Advisor, Score, bienvenue).
  Renommage `const t = m.tontine` → `tn`.
- **`lib/fees.ts`** — `FEES` (const) → `feeLines(t)` + `feesSummary(t)` ;
  `FEE_KEYS` conservé. Bloc `srvFees.line.<key>.{label,fee,detail}`.
  `app/api/v1/trust/route.ts` appelle `feeLines(serverT())`.
- **`lib/business/treasury.ts`** — `MONTHS_FR` (const) → `srvTreasury.m.<0-11>` ;
  `runwayNote` (2 variantes).
- **`app/api/v1/trust/route.ts`** — `guaranteeFund.note` (2 variantes),
  les 5 `disclaimers[]`, et les libellés de palier KYC (`srvTrust.kycTier.<n>` —
  surchargés dans la réponse, `lib/kyc/limits.ts` reste FR pour ses messages
  d'erreur).

Blocs catalogue `srvOpps.*`, `srvInsights.*`, `srvFees.*`, `srvTreasury.*`,
`srvTrust.*` dans `fr.ts` + `en.ts`.

## Conséquences
- ✅ **Toute la prose générée côté serveur destinée au membre est bilingue**.
  Vérifié end-to-end : l'API `/trust` renvoie « Sign-up / Free », « KYC level
  2 » et les mentions en anglais avec le cookie ; `/opportunities` renvoie
  « 1 quotes to follow up — … :: See the quotes ».
- ✅ `tsc` + `lint` (0 warning) + `vitest` (112) + `build` + `playwright` (36 —
  `tontine-lifecycle` + `wallet` ont flaké sous charge puis sont repassés au
  vert isolés) + `db:seed` au vert.
- ⏭️ Reste : le back-office `/admin/*`, et la relecture native de l'éwé (dont
  toute la prose serveur retombe en FR aujourd'hui).
