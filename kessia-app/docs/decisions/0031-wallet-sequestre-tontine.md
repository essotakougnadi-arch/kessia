# ADR 0031 — Wallet séquestre par tontine (§6.5)

**Statut :** accepté · **Date :** 2026-08-31

## Contexte
Jusqu'ici, l'argent d'une tontine transitait par une **astuce comptable** : la
cotisation débitait le membre (`TONTINE_CONTRIBUTION`), le versement créditait le
bénéficiaire (`TONTINE_PAYOUT`), et comme la somme des débits d'un cycle égale la
somme des crédits, « ça tombait juste ». Mais **entre l'encaissement et le
versement, l'argent n'était détenu nulle part** — aucun compte ne portait la
cagnotte. Impossible de répondre à « combien KESSIA détient-il réellement pour ce
groupe, là, maintenant ? ». Bloquant de confiance avant un pilote avec de
l'argent réel (action p2-4 de la feuille de route de clôture).

## Décision
Chaque tontine possède un **compte séquestre** dédié qui DÉTIENT réellement les
cotisations d'un cycle, adossé au même ledger que les wallets des membres.

### Modèle
- Nouvel enum `WalletKind { USER, TONTINE_ESCROW }`.
- `Wallet` : `userId` devient nullable, `+ tontineId String? @unique`,
  `+ kind WalletKind @default(USER)`. Un `TONTINE_ESCROW` n'est jamais rattaché à
  un utilisateur ; un seul par tontine (`Wallet.tontine` ↔ `Tontine.escrowWallet`,
  `onDelete: Cascade`).
- `TontineEventType += ESCROW_SHORTFALL` — journalise un versement bloqué faute
  de fonds détenus suffisants.

### Flux monétaire
- **Cotisation** (`lib/tontine/contributions.ts::settleContribution`, appelé par
  `/contribute`, le seed et les tests) : **débit du membre → crédit du séquestre**
  en une seule écriture atomique à double entrée.
- **Versement** (`orchestrator.ts::checkAndAdvanceRound`) : **débit du séquestre
  → crédit du bénéficiaire**. Rotating/Projet : la cagnotte du tour. Croissance :
  restitution intégrale à chaque membre au dernier tour.
- **Garde de sûreté** : un versement n'est JAMAIS émis pour un montant supérieur
  au solde du séquestre. En cas de manque (ex. cotisations marquées PAID hors
  circuit), l'orchestrateur refuse (`{ ok: false }`), journalise
  `ESCROW_SHORTFALL` + `logApiError`, laisse la tontine ACTIVE — retry au tick
  suivant une fois le rapprochement fait.

### Ledger — `postDoubleEntry`
Nouvelle primitive dans `lib/ledger/ledger.service.ts` : écriture à double entrée
**entièrement atomique** entre deux wallets (les deux jambes dans la même
transaction, `:out` / `:in`), avec :
- `SELECT … FOR UPDATE` sur les deux lignes wallet dans l'ordre lexicographique
  (exclut l'inter-blocage et le TOCTOU de double dépense) ;
- garde de solde sur la jambe débit, contrôle de devise, wallets verrouillés ;
- idempotence sur la clé de base.
`createLedgerEntry` gagne aussi le `SELECT … FOR UPDATE` (durcit **toutes** les
opérations financières de l'app, pas seulement les tontines).

### Rapprochement
`lib/tontine/escrow.ts` : `getOrCreateEscrowWallet`, `escrowExpectedHeld`,
`reconcileTontineEscrow` → `{ held, expectedHeld, drift, balanced }`.
Invariant : `solde(séquestre) == Σ cotisations PAID − Σ membre.totalReceived`.
`refundTontineEscrow(tontineId)` — remboursement au prorata (helper défensif pour
une future annulation, testé, non câblé à une UI).

### Surfaces
- **`GET /api/v1/tontine/[id]`** : `escrow: { held, expectedHeld, balanced }` pour
  les membres. Détail tontine : ligne « 🔒 X FCFA en séquestre pour le groupe ».
- **`GET /api/v1/admin/tontines`** : colonne Séquestre (solde réel) + badge
  « écart » si `!balanced` (rapproché en 3 requêtes groupées, pas de N+1).
- **`GET /api/v1/admin/analytics`** : KPI « Détenu en séquestre (réel) » à côté de
  « Cagnottes en jeu (estimé) ». `wallet.totalHeld` et le volume ledger admin
  filtrent désormais `kind: USER` (on exclut la contrepartie séquestre de la
  double entrée pour ne pas gonfler les chiffres).
- Catalogue i18n : `admin.tontines.{thEscrow,escrowNote,driftBadge,driftTitle}`,
  `admin.analytics.kEscrowHeld`, FR + EN.

### Seed & tests
- `seedTontine` : crée le séquestre + son ledger (CREDIT par cotisation, DEBIT par
  versement) → `solde(séquestre) == expectedHeld` sur toutes les tontines seedées.
- `wipe()` réordonné (ledger + wallets avant les tontines, FK séquestre).
- Tests d'intégration : `tontine-orchestrator` + `tontine-growth` réécrits (le
  circuit passe par le séquestre) ; **nouveau `tontine-escrow.itest.ts`** —
  invariant vérifié à chaque étape d'un cycle 2×2, conservation de la masse
  monétaire, versement refusé si sous-financé, `refundTontineEscrow` idempotent,
  propriétés de `postDoubleEntry` (atomicité / idempotence / solde / verrou).

## Nettoyage (p0-4, glissé dans l'ADR)
- `feesSummary(t)` (code mort, ADR 0028) supprimé + clé `srvFees.summaryLine`
  retirée des catalogues.

## Conséquences
- ✅ **KESSIA détient l'argent des tontines sur un compte identifiable, adossé au
  ledger, à tout instant.** Plus de cagnotte « nulle part ». Rapprochement
  automatique visible en back-office.
- ✅ Toute opération financière est désormais protégée du double-débit concurrent
  (`SELECT … FOR UPDATE`).
- ✅ `tsc` + `lint` (0 warning) + `vitest` (119) + `test:integration` (**27**,
  +4) + `build` + `db:seed` au vert. Rapprochement des 5 tontines seedées
  actives/terminées : `held == expectedHeld` partout (Σ séquestres 325 000 FCFA).
- ⏭️ Non fait : flux d'annulation de tontine avec `refundTontineEscrow` câblé
  (aucun flux SUSPENDED/CANCELLED n'existe encore côté API) ; séquestre
  multi-devise.
