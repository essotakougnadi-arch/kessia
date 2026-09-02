# ADR 0015 — Pages légales (projet), documents imprimables, relances clients automatiques

**Statut :** accepté · **Date :** 2026-08-29

## Contexte
Après ADR 0014, il restait, au titre du **volet code des bloquants pilote** :
les pages légales (bloquant #5) ; et, au titre des compléments MVP attendus
pour un pilote : les documents imprimables (devis / factures / reçus) et les
relances clients automatiques.

## Décisions

### 1. Pages légales — brouillons versionnés
- Routes **publiques** `/legal/terms`, `/legal/privacy`, `/legal/mentions`
  (hors `PROTECTED_ROUTES`). Layout minimal `app/legal/`, composant
  `LegalShell` (en-tête, bouton « Imprimer / PDF », **bandeau « projet — à
  valider juridiquement »** permanent).
- Contenu rédigé à partir de faits vérifiables du produit : modèle de
  données (écran d'export), tableau de rétention (`docs/compliance/matrix.md`),
  sous-traitants (Supabase `eu-west-1`, Vercel, Upstash), grille tarifaire
  (`lib/fees.ts`), droits RGPD implémentés, statut « pas un établissement de
  paiement », Fonds de Garantie en démonstration, Score ≠ crédit, simulateurs
  sans rendement. Les champs propres à l'entité (RCCM, adresse, DPO) sont
  marqués `[…]`.
- Le pied de page de la landing pointe désormais vers ces pages.
- **Ces documents n'ont pas de valeur contractuelle en l'état** — un conseil
  juridique togolais doit les valider avant mise en production.

### 2. Documents imprimables (§7, §6.1, §43)
- `GET /api/v1/business/[id]/invoices/[invoiceId]` : document complet
  (émetteur, destinataire, lignes, totaux).
- `GET /api/v1/wallet/transactions/[id]` : reçu d'une opération (référence,
  type, montant, solde après, date).
- Routes `/documents/*` sous un layout **sans chrome**, feuilles au format
  A4, `@media print` qui masque la barre d'outils. Bouton « Imprimer / PDF »
  → `window.print()` (aucune dépendance ajoutée).
  - `/documents/invoice/[businessId]/[invoiceId]` — devis ou facture.
  - `/documents/receipt/[txId]` — reçu wallet.
- Accès : lien « Imprimer / PDF » sur chaque ligne de l'onglet « Devis &
  Factures » ; chaque opération du wallet est cliquable vers son reçu. Les
  données restent protégées côté API (`requireBusinessOwner`, wallet du
  demandeur). Ajout de `/documents` (et `/growth`, `/simulator`, `/calendar`,
  `/trust`, `/explore`) à `PROTECTED_ROUTES` du middleware.
- Mentions : le devis précise qu'il ne vaut pas facture ; la facture rappelle
  que les mentions fiscales propres à l'activité sont à compléter ; le reçu
  précise qu'il n'est pas une pièce comptable au sens fiscal.

### 3. Relances clients automatiques (§7, §33)
- `Customer` += `followUpNotifiedAt DateTime?`.
- `lib/reminders/customer-reminders.ts` : `isReminderDue()` (**pur, testé**)
  + `runCustomerReminders()` — pour chaque client dont `nextFollowUpAt` est
  échue et non encore notifiée pour cette échéance, notifie l'exploitant
  (catégorie `BUSINESS`, lien vers l'onglet Clients, segment + motif de
  relance) puis pose `followUpNotifiedAt`.
- Câblé dans l'ordonnanceur : `cron/tontine-tick` exécute désormais
  `runTontineTick()` **et** `runCustomerReminders()` (non bloquant l'un pour
  l'autre). Renommage logique du résultat en `{ tontine, reminders }`.
- Reprogrammer une relance (`PATCH .../customers/[customerId]`) remet
  `followUpNotifiedAt` à `null` → la nouvelle échéance pourra renotifier.

## Conséquences
- ✅ Bloquant pilote #5 (pages légales) : le brouillon est prêt, il ne reste
  que la validation juridique et le renseignement des informations de
  l'entité.
- ✅ §7 complété (documents imprimables + relances automatiques), §6.1
  complété (reçus dédiés).
- ✅ `tsc` + `lint` + `vitest` (98) + `build` + `playwright` (33) au vert.
- ⏭️ Améliorations possibles : génération PDF côté serveur (au lieu de
  l'impression navigateur), envoi des documents par e-mail (dépend du canal
  e-mail réel), personnalisation de l'en-tête (logo de l'entreprise).
