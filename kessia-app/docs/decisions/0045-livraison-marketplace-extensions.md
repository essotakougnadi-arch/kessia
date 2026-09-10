# ADR 0045 — Livraison marketplace : carnet d'adresses, panier, séquestre, tontine

**Statut :** accepté · **Date :** 2026-09-10

## Contexte

La livraison Miaride (ADR 0042) couvrait la v1 : fiche produit, achat
WALLET, une commande à la fois, règlement du vendeur immédiat. Quatre
extensions demandées :

1. livraison depuis le **panier multi-articles** — une course par vendeur ;
2. **carnet d'adresses** de l'acheteur ;
3. livraison **différée** pour l'achat par tontine ;
4. option **« paiement du vendeur à la confirmation de réception »** (séquestre).

Contrainte : additif, aucune régression sur le parcours existant, pas de
refonte de la relation `MarketplaceDelivery ↔ MarketplaceOrder`, ne pas
toucher au moteur financier des tontines.

## Décisions

### 1. Séquestre « paiement à la réception » — `lib/marketplace/escrow.ts`

- `MarketplaceItem.settlement` (`IMMEDIATE` | `ON_DELIVERY`), choisi par
  le vendeur à la mise en vente. Défaut `IMMEDIATE` = comportement
  historique inchangé.
- Achat WALLET d'un article `ON_DELIVERY` : `postDoubleEntry`
  acheteur → **wallet séquestre plateforme** (`WalletKind.MARKETPLACE_ESCROW`,
  instance unique, résolue à la demande). Commande `PENDING_SETTLEMENT`.
- Libération vers le vendeur (`SALE_PAYMENT`, clé `MKT_SETTLE_<orderId>`,
  idempotente) :
  - à la confirmation de réception par l'acheteur (`confirmDelivered`), ou
    au webhook `DELIVERED` ;
  - **filet** : `runMarketplaceEscrowTick` libère d'office après
    `ESCROW_AUTO_RELEASE_DAYS = 14` (branché sur le tick horaire).
- Livraison annulée avant enlèvement → `refundEscrowToBuyer` (`REFUND`,
  clé `MKT_ESCROW_REFUND_<orderId>`), commande `REFUNDED`, article remis
  en vente (stock + statut).
- Miroir volontaire du séquestre de tontine (ADR 0031) : `SELECT FOR
  UPDATE`, idempotence par clé, jamais de solde négatif.

### 2. Carnet d'adresses — `model DeliveryAddress` + `lib/marketplace/addresses.ts`

`label` / `area` (clé `LOME_ZONES`) / `address` / `recipientPhone` /
`isDefault`. CRUD : `GET|POST /api/v1/marketplace/addresses`,
`PATCH|DELETE …/[id]` (15 max, la première devient le défaut). La modale
de demande de livraison propose les adresses enregistrées + « nouvelle
adresse » + « enregistrer cette adresse ». `requestDelivery` accepte
`addressId` (résolu côté route) **ou** la saisie libre.

### 3. Panier → une livraison par vendeur — `MarketplaceDelivery.extraOrderIds`

Pas de refonte relationnelle : la livraison garde son `orderId` d'ancrage
(1-1) et liste les **autres** commandes du même vendeur dans
`extraOrderIds String[]`. Frais estimés une seule fois (zone d'enlèvement
du vendeur). Après paiement du panier, l'écran de confirmation regroupe
les commandes par vendeur et propose une livraison par groupe
(`alsoOrderIds`). `confirmDelivered` / `cancelDelivery` règlent /
remboursent le séquestre de **toutes** les commandes couvertes.
`/marketplace/mine` rattache les commandes « supplémentaires » à leur
livraison d'ancrage (`coveredByDeliveryId`).

### 4. Livraison différée (achat par tontine) — `DeliveryStatus.SCHEDULED`

Une commande `mode: TONTINE` peut enregistrer une livraison **SCHEDULED**
(`requestDelivery({ schedule: true })`) : adresse choisie, frais estimés,
**aucun débit**. Elle reste dormante. Quand le plan d'épargne est terminé
(`Tontine.status === COMPLETED`, fonds recrédités sur le wallet),
l'acheteur l'active (`action: 'activate'`) → débit des frais + coursier
(SIMULATED) ou bon Miaride (HANDOFF). L'orchestrateur de tontine n'est
pas modifié.

## Schéma

`WalletKind +MARKETPLACE_ESCROW` · `MarketplaceSettlement{IMMEDIATE,
ON_DELIVERY}` · `MarketplaceOrderStatus +PENDING_SETTLEMENT +REFUNDED` ·
`DeliveryStatus +SCHEDULED` · `MarketplaceItem.settlement` ·
`MarketplaceOrder.settlement/settlementLedgerRef/settledAt` ·
`MarketplaceDelivery.extraOrderIds` · `model DeliveryAddress`.
`prisma db push` (adds seuls) OK sur la base partagée.

## Le jour du vrai partenariat Miaride

Inchangé par rapport à l'ADR 0042 : remplacer l'intérieur de
`MiarideProvider`. Le séquestre, le carnet et le regroupement sont
indépendants du fournisseur.

## Vérification

`tsc` + `lint` (0 warning) + `vitest` (**178**) + `build` OK.
`test/integration/marketplace-settlement.itest.ts` (2 tests) : séquestre
libéré/idempotent, remboursement + remise en vente.
`e2e/marketplace-delivery.spec.ts` : +2 tests (carnet via `addressId`,
règlement à la réception de bout en bout).
