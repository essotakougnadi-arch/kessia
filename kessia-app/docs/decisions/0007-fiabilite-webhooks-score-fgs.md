# ADR 0007 — Fiabilité : webhooks paiement, KESSIA Score, reversal, FGS

**Statut :** accepté · **Date :** 2026-08-28

## Contexte
Lot Fiabilité (ordre du cahier des charges §59). Cahier §6.3/§44 (règlements
asynchrones), §10/§22 (KESSIA Score), §12 (fiabilité tontine), Fonds de
Garantie Solidaire. MASTER : « le ledger est la source de vérité », « aucun
faux paiement présenté comme réel », « ne pas contourner KYC/AML ».

## Décisions

### 1. Webhooks de règlement (`POST /api/v1/payments/webhooks/[provider]`)
- Corps brut → signature **HMAC-SHA256** (`x-kessia-signature`, clé
  `PAYMENT_WEBHOOK_SECRET`). Sans secret configuré (dev local) : accepté mais
  tracé (`payment.webhook_rejected` sinon).
- Événements : `payment.completed` / `payment.failed`, identifiés par
  `reference` (`externalRef` ou id de `PaymentTransaction`).
- **Idempotent** : `settlePendingPayment()` — une transaction déjà
  `COMPLETED`/`FAILED` renvoie `ALREADY_SETTLED` sans effet ; l'écriture
  ledger utilise la clé stable `PAYTX_<txId>`.
- `completed` → écriture ledger (crédit/débit selon la direction) +
  `PaymentTransaction.status=COMPLETED` + notification `PAYMENT`.
- Jamais authentifié par session ; hors matcher du middleware (`api/`).

### 2. Reversal de transfert
- `wallet/transfer` : si le **crédit du destinataire échoue** après le débit
  de l'expéditeur, une écriture `REVERSAL` (crédit, clé `REV-<referenceId>`)
  rétablit le solde. Résultat tracé dans l'audit (`reversed: true/false`).

### 3. Idempotency-Key entrant
- `wallet/transfer` et `tontine/[id]/contribute` acceptent l'en-tête
  `Idempotency-Key`. Transfert : les deux écritures en sont dérivées
  (`:out` / `:in`) → un rejeu ne double ni débit ni crédit. Cotisation : clé
  `TONTINE-<memberId>-<round>` (déjà naturellement unique) + suffixe header.

### 4. KESSIA Score (`lib/score/`, `GET /api/v1/score`)
- **Modèle à base de règles, déterministe, explicable.** `score = 300 + Σ
  points`, borné `[0, 1000]`. Facteurs : identité KYC (max 200), ancienneté
  (100), activité wallet (120), fiabilité tontine (220, malus possible),
  participation tontine (60), activité Business (80), 2FA (40) ; malus wallet
  verrouillé / sanctions tontine.
- Chaque facteur renvoie `points / max / detail` (« 4 cotisations à temps ») +
  jusqu'à 3 conseils priorisés. **Aucune boîte noire, aucune donnée sensible.**
- Recalculé à la demande ; la valeur numérique est persistée dans
  `UserProfile.kessiaScore` pour les affichages existants (profil).
- ⚠️ **Ce n'est pas un score de crédit réglementé.** Il ne déclenche aucun
  octroi automatique de fonds (voir §5 ci-dessous et matrix.md §5).

### 5. Fonds de Garantie Solidaire (FGS) — **structure documentée, non activé**
- Objectif cahier : filet de sécurité mutualisé couvrant partiellement les
  défauts de cotisation en tontine.
- **Bloquant réglementaire** : un mécanisme de mutualisation du risque
  s'apparente à de l'assurance / une garantie financière → **exige une
  qualification juridique et très probablement un partenaire habilité**
  (matrix.md §1, §6). KESSIA ne peut pas l'opérer seule.
- **Décision : ne coder aucun mouvement de fonds FGS avant validation.**
  Posture MVP :
  - `KESSIA Score` fournit déjà le signal de fiabilité qui alimenterait
    l'éligibilité FGS.
  - Modèle de données cible (à créer au moment de l'activation) :
    `GuaranteeFund` (solde, source d'alimentation : % des frais), `GuaranteeClaim`
    (tontine, membre défaillant, montant, statut, revue humaine obligatoire).
  - Alimentation envisagée : fraction d'un futur frais de service tontine —
    **pas de prélèvement tant que la grille tarifaire n'est pas publiée**.
- Suivi : matrix.md, backlog LOT Fiabilité.

## Conséquences
- ✅ Chaîne de paiement asynchrone réaliste et rejouable ; solde jamais
  incohérent sur échec de transfert ; score de confiance transparent et
  actionnable.
- ⚠️ En prod : configurer `PAYMENT_WEBHOOK_SECRET` par fournisseur, restreindre
  la source (IP / mTLS selon le partenaire), brancher la réconciliation avec
  les relevés.
- ⏭️ Non fait : payout automatique de tontine (calendrier `TontineSchedule`
  existe mais non orchestré), relances de cotisation en retard (cron), FGS
  opérationnel.
