# ADR 0009 — Orchestration des tontines & tests E2E

**Statut :** accepté · **Date :** 2026-08-28

## Contexte
Après le plan « MVP durci », deux manques empêchaient de dire « le produit
tourne seul et est testé » :
- une tontine ne progressait jamais d'elle-même (`currentRound` figé, aucun
  versement) — cahier §12 ;
- aucun test de bout en bout des parcours critiques — cahier §49.

## Décision

### 0. Les 4 types de tontines (§6.4)
`lib/tontine/type-meta.ts` — métadonnées partagées (libellé, description,
étapes, icône, accent, **mode de distribution**) pour :

| Type | Distribution | `totalRounds` | Versement |
|---|---|---|---|
| Classique Tournante | `rotating` | nb membres | à chaque tour, la cagnotte à 1 membre |
| Achat | `rotating` | nb membres | idem (framing « achat groupé ») |
| Projet | `project` | 1 | toute la cagnotte à l'organisateur (position 1) en fin de collecte |
| Croissance | `growth` | nb membres | rien pendant le cycle ; en fin, **chaque membre récupère sa mise** (`totalContributed`) |

`PURCHASE` ajouté à l'enum `TontineType`. UI : bandeau résumé + badge de
type sur les cartes + section « Les 4 types » (onglet Tontines), sélecteur
de type dans le formulaire de création, bloc explicatif sur le détail.

### 1. Orchestration des tontines (`lib/tontine/`)
- `schedule.ts` (pur) : `addFrequency` / `addFrequencyN` — WEEKLY +7 j,
  BIWEEKLY +14 j, MONTHLY +1 mois calendaire.
- `type-meta.ts::totalRoundsForType()` fixe la longueur du cycle ;
  `checkAndAdvanceRound` branche sur le mode de distribution (garde
  d'idempotence : `TontineSchedule.isPaid` pour rotating/project, statut
  `COMPLETED` pour la clôture).
- `orchestrator.ts` :
  - **`activateTontine(id)`** : `PENDING → ACTIVE`. Normalise les positions
    (ordre d'adhésion), génère le calendrier `TontineSchedule` (le membre en
    position *r* reçoit au tour *r*), crée les cotisations `PENDING` du tour 1,
    fixe `currentRound = 1` et `nextContributionDate`.
  - **`checkAndAdvanceRound(id)`** : si toutes les cotisations `PAID` du tour →
    **versement de la cagnotte** (`amount × membres`) au bénéficiaire
    (`TONTINE_PAYOUT`, clé ledger idempotente `TPAYOUT-<id>-<round>`),
    `totalReceived += pot`, `TontineSchedule.isPaid`, puis `currentRound++`
    (+ cotisations `PENDING` du tour suivant) ou `COMPLETED` au dernier tour.
    Notifie le bénéficiaire et les membres.
  - **`runTontineTick()`** : passe les cotisations échues en `LATE`, envoie des
    relances (≤ 2 j / en retard, anti-spam 20 h), rattrape un tour complet non
    versé.
- **Câblage** :
  - adhésion complète (`/tontine/join`, `/tontine/[id]/members`) → activation
    automatique ;
  - `PATCH /api/v1/tontine/[id] { action: 'start' }` → démarrage manuel par le
    créateur (≥ 2 membres) — bouton « Démarrer la tontine » sur le détail ;
  - `/tontine/[id]/contribute` appelle `checkAndAdvanceRound` après chaque
    cotisation ;
  - `POST /api/v1/cron/tontine-tick` (secret `x-cron-secret` == `CRON_SECRET`,
    obligatoire en prod) — **à brancher sur un ordonnanceur** (Vercel Cron /
    GitHub Actions), ~toutes les heures.
- **Comptabilité** : les cotisations débitent les wallets ; le versement
  crédite le bénéficiaire du total. Somme nulle sur un cycle complet. Pas de
  wallet séquestre dédié en MVP (à envisager pour la réconciliation).

### 2. Tests E2E (Playwright)
- `@playwright/test`, `playwright.config.ts`, dossier `e2e/`, **viewport
  mobile** (390×844 — l'app est mobile-first, §37).
- Specs : `auth` (connexion mot de passe, RBAC `/admin`, route protégée),
  `onboarding`, `navigation` (5 modules + Score + écrans de compte + AI),
  `wallet` (dépôt simulé crédité, transfert refusé), `tontine` (liste,
  création, rejoindre par code), `tontine-lifecycle` (**démarrage auto +
  versement au bénéficiaire de bout en bout**), `admin` (dashboard, KYC,
  réponse agent à un ticket). **21 tests, verts.**
- `helpers.ts` : `loginViaApi` (cookie + `localStorage` + `Authorization` sur
  `page.request`) et `loginViaForm`.
- **`E2E_RATE_LIMIT_BYPASS=1`** : neutralise le rate limiting (la suite
  enchaîne les connexions depuis une IP unique ; le build E2E tourne en
  `NODE_ENV=production`, donc pas de garde sur l'environnement). Opt-in
  explicite, **jamais sur un déploiement réel** — un `console.warn` de
  sécurité est émis au démarrage si la variable est définie.
- CI : `.github/workflows/e2e.yml` — service Postgres jetable, `db push` +
  seed, build, Playwright, upload du rapport.

## Conséquences
- ✅ Une tontine complète démarre, encaisse et distribue seule ; les retards
  sont suivis et relancés ; les 15 parcours critiques (§49) ont une base de
  tests exécutable en CI.
- ⚠️ `runTontineTick` doit être déclenché par un ordonnanceur externe (non
  fourni). Sans lui : les tours avancent quand même à la dernière cotisation,
  mais les mises en retard / relances n'ont pas lieu.
- ⚠️ Les tests E2E écrivent en base → **base de test dédiée obligatoire**
  (Postgres local ou branche Supabase), jamais la prod.
- ⏭️ À suivre : wallet séquestre par tontine + réconciliation ; payout par
  virement sortant réel (quand un fournisseur est branché) ; suite E2E
  multi-navigateurs.
