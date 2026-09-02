# Playbook support — KESSIA

_Dernière mise à jour : 2026-08-29 (ADR 0016)_

Ce document guide l'agent de support (rôle `SUPPORT` ou `ADMIN`) dans le
traitement des demandes. Il s'appuie sur des fonctionnalités réellement
présentes dans le produit ; il ne décrit pas de procédure hypothétique.

## 1. Principes

- **Ne jamais contourner un contrôle.** KYC, plafonds, AML, permissions,
  verrouillage anti-bruteforce, anti-fraude : aucune de ces règles ne se
  désactive « pour dépanner ». Une exception légitime passe par la conformité
  (`COMPLIANCE`), tracée.
- **Ne jamais divulguer de donnée d'un autre compte.** On ne confirme pas
  l'existence d'un compte tiers, on ne lit pas ses transactions, on ne relaie
  pas un solde.
- **Toute action en écriture est auditée.** Les actions passent par
  `/admin/support/[id]` (affectation, statut, réponse, note interne) ou
  `/admin/users` (modération de compte). Pas d'accès direct à la base.
- **Ton :** clair, factuel, en français, tutoiement de politesse évité (vouvoiement).
  On explique ce qui se passe et l'étape suivante — pas d'excuses en boucle,
  pas de promesse de délai qu'on ne tient pas.
- **Donnée financière :** ne jamais inventer un montant. Si l'information
  n'est pas visible dans l'admin, on le dit et on escalade.

## 2. Cycle de vie d'un ticket

`SupportTicket` : `ticketNumber`, `category`, `priority`, `subject`,
`description`, `status`, `assignedToId`.

Statuts (`TicketStatus`) :

| Statut | Sens | Action attendue |
|---|---|---|
| `OPEN` | reçu, non pris en charge | affecter (`assignedToId`) sous 1 j ouvré |
| `IN_PROGRESS` | un agent travaille dessus | tenir le client informé |
| `WAITING` | en attente d'une info du client | relancer à J+3, clôturer à J+10 sans réponse |
| `RESOLVED` | solution fournie | le client peut rouvrir en répondant |
| `CLOSED` | terminé | archive |

Messages : `TicketMessage` avec `isInternal` — les notes internes (`isInternal:
true`) ne sont **jamais** visibles du client. Vérifier la case avant d'envoyer
une remarque sensible.

Priorités : `LOW` / `NORMAL` / `HIGH` / `URGENT`. Mettre `URGENT` uniquement
pour : suspicion de fraude en cours, accès compte perdu avec opération
imminente, incident affectant plusieurs utilisateurs.

## 3. Catégories et premier niveau de réponse

### `ACCOUNT` — accès, profil
- **OTP non reçu :** vérifier le numéro (format `+228…`), demander de patienter
  60 s puis « Renvoyer le code ». Le code expire vite et est à usage unique.
  L'agent ne lit jamais un code OTP (interdit par `lib/audit`).
- **Compte verrouillé après échecs de connexion :** le verrouillage est
  temporaire et automatique. Ne pas le lever manuellement ; expliquer le délai.
- **Changement de numéro :** procédure encadrée (vérification d'identité),
  escalade `ACCOUNT` + `HIGH`.
- **Suppression de compte :** l'utilisateur la demande lui-même via
  `/profile/privacy` (demande + annulation possible). L'effacement effectif
  est une procédure manuelle encadrée — voir `docs/decisions/0006`.

### `KYC` — vérification d'identité
- Statuts et motifs de rejet sont visibles par l'utilisateur dans son espace
  KYC, avec l'aide contextuelle IA. Reformuler le motif, ne pas en inventer.
- **Revue :** `/admin/kyc` — valider / rejeter avec motif / demander une action.
  Toute décision notifie l'utilisateur.
- **Liveness / biométrie / screening sanctions :** non disponibles (prestataire
  IDV non contractualisé). Ne pas promettre de vérification renforcée.
- **Plafonds (§30) :** si un virement est refusé pour dépassement de plafond,
  c'est le comportement attendu (`lib/kyc/limits.ts`). Orienter vers la montée
  de palier KYC. Ne pas relever un plafond à la main.

### `WALLET` / `PAYMENT` — solde, transferts, recharges, retraits
- **« Mon transfert n'est pas arrivé » :** ouvrir `/admin/transactions`,
  retrouver la référence. Un transfert dont le crédit échoue est
  automatiquement contre-passé (`REVERSAL`, clé `REV-<ref>`) — le solde de
  l'émetteur est rétabli. Communiquer la référence et le statut réel.
- **Statuts de transaction :** `PENDING` → `PROCESSING` → `COMPLETED` /
  `FAILED` / `REVERSED`. Un webhook fournisseur fait passer `PENDING` à
  l'état final.
- **Reçu :** chaque opération du wallet est cliquable vers son reçu imprimable
  (`/documents/receipt/[txId]`). Orienter l'utilisateur vers ce lien plutôt
  que de recopier les montants.
- **Fournisseurs de paiement :** simulés en l'état (4 fournisseurs, ADR 0005).
  Aucun mouvement d'argent réel tant que les contrats ne sont pas signés.

### `TONTINE`
- **Rejoindre :** par code, écran dédié. Un code invalide renvoie une erreur
  explicite.
- **« Je n'ai pas reçu mon tour » :** le versement au bénéficiaire est
  automatique quand le tour est complet (`lib/tontine/orchestrator`). Vérifier
  dans `/admin/tontines` si le tour est effectivement complet (toutes
  cotisations `COMPLETED`).
- **Cotisation en retard :** l'ordonnanceur (`cron/tontine-tick`, horaire)
  marque `LATE` et relance. Si l'ordonnanceur n'est pas activé en prod
  (`CRON_TICK_URL` / `CRON_SECRET`), les relances ne partent pas — signaler à
  l'équipe technique.
- **Fonds de Garantie Solidaire :** **mode démonstration**. Aucune indemnisation
  réelle. Ne jamais laisser entendre le contraire.

### `BUSINESS`
- Produits / ventes / dépenses / factures / CRM / devis→facture : autonomes
  côté utilisateur.
- **Devis / facture imprimable :** lien « Imprimer / PDF » par ligne
  (`/documents/invoice/[businessId]/[invoiceId]`).
- **Relances clients :** automatiques à l'échéance `nextFollowUpAt` via
  l'ordonnanceur ; reprogrammer une relance réarme la notification.

### `SECURITY`
- **Perte du second facteur (TOTP) :** codes de secours générés à l'activation.
  Sans code de secours → vérification d'identité renforcée, escalade `SECURITY`
  + `URGENT`.
- **Activité suspecte signalée par l'utilisateur :** créer/relier une
  `FraudAlert`, escalade conformité. **Aucun blocage de fonds automatique** —
  la décision est humaine (`COMPLIANCE`).

## 4. Escalade

| Situation | Vers | Priorité | Canal |
|---|---|---|---|
| Suspicion de fraude, blanchiment, financement illicite | `COMPLIANCE` | `URGENT` | note interne + alerte sécurité |
| Perte d'accès compte + opération imminente | `SECURITY` | `URGENT` | — |
| Décision KYC contestée avec pièces à l'appui | `COMPLIANCE` | `HIGH` | — |
| Bug affectant plusieurs utilisateurs / argent | Équipe technique | `URGENT` | incident (`docs/operations/backup-recovery.md` §réponse à incident) |
| Demande légale / réquisition | Direction + conseil juridique | `URGENT` | hors outil |
| Fonctionnalité non disponible (Market, Invest, Assurance…) | — | `LOW` | réponse type : Phase 8, captation d'intérêt via `/explore` |

Une escalade `COMPLIANCE` / `SECURITY` se fait par **note interne** sur le
ticket + changement de catégorie/priorité + affectation à un membre du rôle
concerné. On n'agit pas sur les fonds ni sur le compte à leur place.

## 5. Réponses types

- **Fonctionnalité Phase 8 :** « Cette fonctionnalité (KESSIA Market / Invest /
  Assurance) n'est pas encore ouverte. Vous pouvez indiquer votre intérêt
  depuis l'onglet Explorer ; cela nous aide à prioriser. »
- **Fonds de Garantie :** « Le Fonds de Garantie Solidaire est présenté en
  mode démonstration : les règles et projections sont visibles, mais aucune
  indemnisation n'est versée à ce stade. »
- **Score KESSIA :** « Le Score KESSIA est un indicateur interne explicable
  (7 facteurs). Ce n'est pas un score de crédit réglementé et il n'est
  partagé avec aucun tiers. »
- **Simulateurs :** « Les simulateurs projettent vos versements ; ils
  n'appliquent aucun rendement ni intérêt. »

## 6. Ce que l'agent ne fait jamais

- Lire ou communiquer un mot de passe, un code OTP, un secret 2FA, le contenu
  d'un document KYC.
- Modifier un solde, forcer une transaction, annuler un plafond, valider un
  KYC sans les pièces.
- Confirmer des informations sur un compte tiers.
- Désactiver le rate limiting, le verrouillage anti-bruteforce ou l'anti-fraude.
- Promettre une date de mise en production d'une fonctionnalité réglementée.
