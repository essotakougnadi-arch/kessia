# ADR 0042 — Livraison des achats Marketplace via Miaride

**Statut :** accepté · **Date :** 2026-09-09

## Contexte

Le Marketplace (ADR 0039) crée une `MarketplaceOrder` et s'arrête là :
aucune logistique. L'utilisateur veut pouvoir **se faire livrer** un
article acheté, via **Miaride** — plateforme togolaise de coursier
moto/voiture + VTC (Grand Lomé).

Pas d'API ni de partenariat Miaride à ce stade. On applique donc le
patron maison (ADR 0005/0040) : **abstraction fournisseur + adaptateur
simulé, honnête, prêt à recevoir le vrai le jour venu.**

## Décision

Décisions cadrées avec l'utilisateur (AskUserQuestion) :

1. **Deux modes** portés par un `DeliveryProvider` :
   - `SIMULATED` — expérience de démonstration. Les statuts avancent
     tout seuls (`REQUESTED → COURIER_ASSIGNED → PICKED_UP →
     IN_TRANSIT`), coursier fictif, **bandeau « aperçu » explicite**.
     La dernière étape (`DELIVERED`) n'est jamais automatique : c'est
     l'acheteur qui confirme la réception (l'app ne peut pas le
     savoir), ou un vrai webhook Miaride qui la pousse.
   - `HANDOFF` — **100 % réel, sans partenariat** : KESSIA prépare le
     bon de livraison (enlèvement, dépôt, destinataire, désignation +
     valeur du colis) et ouvre Miaride via un lien pré-rempli
     (`MIARIDE_DISPATCH_URL`, `wa.me` ou web). L'acheteur commande
     dans Miaride puis revient coller son **code de suivi**.
2. **Périmètre v1** : fiche produit, **mode d'achat WALLET uniquement**
   (pas le panier, pas l'achat par tontine — la livraison viendra
   après le solde du plan, hors périmètre ici).
3. **Règlement du vendeur inchangé** : payé à l'achat, comme
   aujourd'hui. La livraison est un **service en plus**, payé
   séparément par l'acheteur (`FEE`, clé idempotente `DELIV-<orderId>`).
   Annulation avant enlèvement → remboursement (`REFUND`).
4. **Couverture** : Grand Lomé (23 quartiers, `LOME_ZONES`, anneaux
   0/1/2). Tarif = **estimation** dérivée de l'écart d'anneaux
   (`estimateFee`, pur, testé), bornée 500–1600 FCFA, jamais présentée
   comme un prix ferme. Hors zone / quartier d'enlèvement non renseigné
   → message clair, on garde l'arrangement direct vendeur↔acheteur.

## Implémentation

- **Schéma** : `MarketplaceItem.pickupZone` (clé `LOME_ZONES`) ;
  `MarketplaceDelivery` (1-1 `MarketplaceOrder`) ; enums
  `DeliveryProviderKind` / `DeliveryMode` / `DeliveryStatus`.
- **`lib/delivery/`** : `zones.ts` (+ `zones.test.ts`, 4 tests),
  `types.ts` (contrat `DeliveryProvider`), `miaride.ts`
  (`MiarideProvider` simulé), `index.ts` (orchestration :
  `requestDelivery`, `markSellerReady`, `advanceSimulatedDelivery`,
  `confirmDelivered`, `cancelDelivery`, `attachTracking`,
  `runDeliveryTick`).
- **API** : `POST …/deliveries/quote`, `POST …/deliveries`,
  `GET/POST …/deliveries/[id]` (`advance|ready|confirm|cancel|tracking`),
  `POST …/deliveries/webhooks/miaride` (HMAC `x-miaride-signature` /
  `MIARIDE_WEBHOOK_SECRET` — construit maintenant, interface réelle).
  Rattrapage des étapes simulées branché dans `cron/tontine-tick`.
- **UI** : `sell` gagne un select « quartier d'enlèvement » ; fiche
  produit affiche « Livraison Miaride possible » si l'article a un
  quartier ; `/marketplace/mine` porte toute la livraison —
  `components/marketplace/DeliveryPanel.tsx` : modale de demande
  (devis en direct, total = article + frais, bascule hand-off),
  timeline de suivi (polling léger toutes les 12 s jusqu'à
  « en route »), actions « J'ai bien reçu » / « Annuler » côté
  acheteur, bloc « Livraisons à préparer » + « Colis prêt » côté
  vendeur.
- **Config** : `MIARIDE_ENABLED`, `MIARIDE_DISPATCH_URL`,
  `MIARIDE_TRACKING_BASE`, `MIARIDE_WEBHOOK_SECRET` (`.env.example`).
- **Seed** : quartiers d'enlèvement sur 5 articles ; une livraison
  simulée `IN_TRANSIT` sur l'achat de démo.
- i18n FR+EN (`market.delivery.*`, `market.fieldPickupZone*`).
- `e2e/marketplace-delivery.spec.ts` : achat wallet → devis → demande
  → timeline → « colis prêt » vendeur → confirmation acheteur =
  `DELIVERED`.

## Le jour du vrai partenariat Miaride

Remplacer l'intérieur de `MiarideProvider` (quote via leur API,
`createDelivery` réel, `simulated = false`), configurer
`MIARIDE_WEBHOOK_SECRET` — le webhook et la machine à états sont déjà
là. Aucun changement de schéma ni d'UI.

## Vérification

`tsc` + `lint` (0 warning) + `vitest` (**178**, +4) + `build` OK.
E2E production : navigation / tontine / wallet / explore-crm /
marketplace-cart / **marketplace-delivery** / legal / auth — au vert
(le seul rouge en run groupé, `marketplace-cart`, est l'accumulation
connue de dépôts sur la base de dev partagée ; vert en isolé après
re-seed). Vérifié de bout en bout (Playwright, 2 comptes) : demande,
devis, timeline, « colis prêt », confirmation de réception.
