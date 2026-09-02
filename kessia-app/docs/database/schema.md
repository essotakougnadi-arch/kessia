# Modèle de données (§41, §42)

Source de vérité : `prisma/schema.prisma`. PostgreSQL (Supabase), accès via
le pooler (session mode). Ce document donne la carte ; les champs exacts
sont dans le schéma Prisma.

## Conventions

- Identifiants `cuid()`. `createdAt` / `updatedAt` sur les entités mutables.
- Montants : `Decimal(18,2)`, devise `XOF` par défaut.
- Suppressions : `onDelete: Cascade` pour les enfants d'un agrégat,
  `SetNull` quand la référence est optionnelle (ex. `Expense.supplierId`).
- Les vues « calculées » (trésorerie, ADN, plan de croissance, agenda,
  analytics) **ne sont pas des tables** : elles sont recomputées à la demande.

## Identité & sécurité

| Modèle | Rôle |
|---|---|
| `User` | compte : téléphone, rôle RBAC, statut KYC, 2FA, verrous, `termsAcceptedVersion` + `termsAcceptedAt` (§8, ADR 0016) |
| `UserProfile` | profil déclaratif : `userType`, ville, langue, score, préférences de notification |
| `Session` | sessions actives (refresh token hashé) |
| `OtpCode` | codes OTP (inscription, connexion) |
| `KycCase` / `KycDocument` | dossiers KYC, statuts §30 ; pièces = `storageKey` (Supabase Storage privé) ou `fileUrl` data-URI de repli (ADR 0014) |
| `Device` | empreintes d'appareils (anti-fraude §32) |
| `FraudAlert` | alertes anti-fraude, revue humaine `COMPLIANCE` |
| `AuditLog` | journal d'audit de toutes les actions critiques |

## Wallet & paiements

| Modèle | Rôle |
|---|---|
| `Wallet` | `kind` = `USER` (un par utilisateur) ou `TONTINE_ESCROW` (un par tontine, `tontineId` unique, jamais rattaché à un utilisateur — §6.5). Solde, verrou |
| `LedgerEntry` | **source de vérité** : écritures atomiques (`SELECT … FOR UPDATE`), idempotentes, `balanceBefore/After`. Double entrée pour les mouvements tontine ↔ séquestre |
| `PaymentTransaction` | dépôts / retraits via l'abstraction `PaymentProvider` (simulés) |
| `NotificationDelivery` | journal de distribution multi-canal (§33) |

## Tontines

| Modèle | Rôle |
|---|---|
| `Tontine` | 4 types, montant, fréquence, `currentRound`, `agreementJson` (contrat figé) |
| `TontineMember` | membres, position, `totalContributed/Received`, `agreementAcceptedAt` |
| `TontineContribution` | cotisations par tour (`PAID` / `PENDING` / `LATE`) |
| `TontineSchedule` | calendrier des versements (bénéficiaire par tour) |
| `TontineEvent` | journal (création, adhésion, cotisation, versement, clôture…) — comble §42 |
| `GuaranteeClaim` / `GuaranteeEvent` | Fonds de Garantie Solidaire — **mode démonstration**, aucun solde stocké |

## Business (§7, §8, §17)

| Modèle | Rôle |
|---|---|
| `Business` | activité (secteur, ville) |
| `Product` / `InventoryMovement` | catalogue + mouvements de stock |
| `Sale` / `SaleItem` | ventes |
| `Expense` | dépenses (rattachables à un `Supplier`) |
| `Invoice` | devis (`QUOTE`) et factures (`INVOICE`), `convertedInvoiceId` |
| `Customer` | CRM : `type` (prospect/client), notes, relances datées |
| `Supplier` | fournisseurs |
| `BusinessGoal` | objectifs (`REVENUE` / `MARGIN_RATE` / `SALES_COUNT` / `NEW_CUSTOMERS`) |
| `BusinessPlan` | brouillon de plan d'affaires généré depuis l'ADN, éditable (un par entreprise) |

## Croissance, IA, expansion

| Modèle | Rôle |
|---|---|
| `GrowthStepState` | progression de l'utilisateur sur les étapes du plan de croissance (§23) |
| `AiConversation` / `AiMessage` | historique du chat KESSIA AI |
| `ModuleInterest` | captation d'intérêt pour les modules Phase 8 (§9–§16) |

## Support & notifications

| Modèle | Rôle |
|---|---|
| `SupportTicket` / `TicketMessage` / `TicketAttachment` | tickets (catégorie, priorité, statut, agent, notes internes) ; pièces jointes (§46, ADR 0018 — `storageKey` bucket privé ou repli `dataUrl`, `isInternal`) |
| `Notification` | notifications in-app, 7 catégories, préférences respectées |

## Entités non encore modélisées (écart §42, assumé MVP)

`LedgerAccount` (ledger simplifié à écriture unique), `Course` /
`CourseProgress` (Academy — Phase 8), `Partner` (partenaires — Phase 8),
coffre-fort documentaire dédié (Document Vault — Phase 8).
