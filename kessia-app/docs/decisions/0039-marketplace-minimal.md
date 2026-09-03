# ADR 0039 — Mini-marketplace & achat par tontine (étape 2)

**Statut :** accepté · **Date :** 2026-09-03

## Contexte

Le marketplace (§16) n'existait pas : seule une captation d'intérêt sur
`/explore`. L'étape 2 de la découverte (après ADR 0038) : un **module
articles minimal** — un membre met un article en vente, un autre l'achète
**depuis son wallet** ou **par une tontine Achat individuelle (SOLO)**
pré-remplie avec le prix comme cible. Les articles défilent aussi sur
l'accueil / la landing ; les voir et acheter exige un compte.

## Décision

### Schéma (`prisma db push`)
- `MarketplaceItem` : `sellerId`, `businessId?`, `title`, `description?`,
  `category?`, `price`, `currency`, `imageUrl?` (data-URI compressée
  côté client, comme le KYC en MVP), `city?`, `payableByTontine`,
  `tontineInstallments?`, `stock`, `status` (`ACTIVE`/`SOLD_OUT`/`ARCHIVED`).
- `MarketplaceOrder` : `itemId`, `buyerId`, `mode` (`WALLET`/`TONTINE`),
  `amount`, `status` (`PAID`/`TONTINE_STARTED`/`CANCELLED`), `ledgerRef?`,
  `tontineId?`.
- `lib/marketplace/marketplace.ts` : `installmentAmount()`,
  `describeBuyability()` (pures, 12 cas testés).

### API
| Route | Auth | Rôle |
|---|---|---|
| `GET /api/v1/marketplace` | **publique** | catalogue `ACTIVE` + `stock>0` (filtres `q`, `category`, `tontine`, curseur) |
| `POST /api/v1/marketplace` | connecté | mise en vente (élève en `BUSINESS_OWNER`) |
| `GET /api/v1/marketplace/[id]` | **publique** | détail |
| `PATCH` / `DELETE /api/v1/marketplace/[id]` | vendeur | modifier / archiver |
| `GET /api/v1/marketplace/mine` | connecté | mes articles + mes achats |
| `POST /api/v1/marketplace/[id]/order` | connecté | acheter |
- **`GET /api/v1/discover`** renvoie désormais `{ tontines, items }`.

### Achat — `POST …/order`
- **`{ mode: 'WALLET' }`** : `postDoubleEntry` (atomique) wallet acheteur
  → wallet vendeur, type `SALE_PAYMENT`, `stock--`, ordre `PAID`, notif
  vendeur.
- **`{ mode: 'TONTINE', installments }`** (si `payableByTontine`) :
  `$transaction` crée une tontine `PURCHASE`/`SOLO` (créateur = acheteur,
  `purchaseItem` = titre, `targetAmount` = prix, `amount` = prix ÷ versements,
  `PENDING`, acheteur membre) + ordre `TONTINE_STARTED` lié. L'acheteur est
  redirigé vers la tontine et la démarre / cotise normalement (§6.4).

### Frontend
- **`components/discover/MarketplaceRail.tsx`** (rail / grille) sur la
  landing et l'accueil, alimenté par `/api/v1/discover`. Déconnecté →
  `/register?next=/marketplace/{id}` + intention stockée.
- **Pages sous `(dashboard)/marketplace/`** (donc **protégées** —
  `/marketplace` ajouté à `PROTECTED_ROUTES` : « accès conditionné à une
  connexion ») : catalogue + filtres, détail + modale d'achat (wallet /
  tontine), formulaire de vente (photo compressée), « Mes articles & achats ».
- Nav : entrée **Marketplace** dans la Sidebar + grille de services de
  l'accueil. Module `market` passé **`LIVE`** dans le catalogue (`/explore`).
- **Sidebar** enfin branchée sur l'utilisateur réel (nom, statut KYC,
  avatar) + **bouton Déconnexion fonctionnel** (`useAuth().logout`) — le
  stub « Kossi Abalo » est supprimé.
- `lib/files/compress-image.ts` extrait (réutilisé par le KYC et la vente).
- i18n FR + EN : `market.*`, `nav.marketplace`, `nav.kyc*`.

### Seed
- 7 articles (dont 4 payables par tontine), 1 achat wallet réglé.

## Conséquences
- ✅ `tsc` + `lint` (0 warning) + `vitest` (**167**, +7) + `build` +
  E2E (auth, wallet) au vert. Smoke test API : liste → vente → achat
  wallet (solde débité au centime) → achat tontine (tontine SOLO créée,
  objectif = prix) → « Mes achats ».
- L'achat par tontine ne verse pas automatiquement le vendeur : il crée
  le **plan d'épargne** ; le règlement se fait ensuite (le séquestre SOLO
  recrédite l'acheteur au dernier versement, cf. ADR 0035). Un lien
  paiement-vendeur automatique reste une évolution.
- Images en data-URI (comme le KYC) — un vrai stockage objet reste à
  câbler avant un usage réel intensif.
- Marché §16 = **version minimale** : pas de messagerie acheteur/vendeur,
  pas de livraison, pas d'avis. Suffisant pour le parcours de découverte.
