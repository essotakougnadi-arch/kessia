# ADR 0011 — Parcours par profil, CRM business, ADN d'entreprise, hub Explorer

**Statut :** accepté · **Date :** 2026-08-29

## Contexte
Suite de l'ADR 0010. Finalisation, dans la part qui relève du code, des
sections §4 (parcours adapté au profil), §7 (gestion business — CRM d'abord),
§8 (ADN de l'entreprise) et §9–§16 (modules de la feuille de route). Market,
Academy, Community, Jobs, Invest, Insurance, Diaspora ne sont pas construits ;
le cahier des charges les place en Phase 8, Invest et Insurance étant en plus
bloqués réglementairement.

## Décisions

### §4 — Parcours adapté au `userType`
- `lib/user/user-type.ts` enrichi : chaque profil porte désormais `focus`
  (modules mis en avant, ordre = priorité), `firstSteps` (3 premiers pas avec
  lien) et `aiPrompts` (questions suggérées à KESSIA AI).
- **Accueil** (`home-client.tsx`) : la grille « Services rapides » est
  réordonnée selon `focus` ; une carte « Premiers pas · <profil> » liste les
  `firstSteps`. Aucune donnée financière n'en dépend — pur agencement.
- **KESSIA AI** (`ai-client.tsx`) : les puces de suggestions viennent des
  `aiPrompts` du profil (repli sur une liste générique si profil non chargé).
- Le `userType` n'accorde toujours aucune permission (distinct du rôle RBAC).

### §7 — Gestion business : CRM d'abord
Nouveaux modèles : `Supplier`, `BusinessGoal` ; `Customer` gagne `type`
(`PROSPECT`/`CLIENT`), `address`, `nextFollowUpAt`, `followUpNote` ; `Expense`
gagne `supplierId` (`onDelete: SetNull`) ; `Invoice` gagne `kind`
(`QUOTE`/`INVOICE`) et `convertedInvoiceId`.

- **Contrôle d'accès** : `lib/business/access.ts::requireBusinessOwner()`
  centralise « la ressource existe + appartient à l'appelant » pour toutes les
  routes CRM.
- **Clients** (`/api/v1/business/[id]/customers[/*]`) : liste segmentée
  (`lib/business/crm.ts::customerSegment` — `PROSPECT`/`NOUVEAU`/`REGULIER`/
  `FIDELE`/`INACTIF`, dérivée du comportement d'achat, pure et testée), fiche
  détaillée (coordonnées, notes libres, relance datée + motif, historique
  ventes & factures), création / mise à jour / suppression (bloquée si le
  contact a des ventes ou factures).
- **Fournisseurs** (`/suppliers[/*]`) : répertoire + total acheté + dernier
  achat ; les dépenses peuvent y être rattachées.
- **Devis → facture** : `POST /invoices` accepte `kind` ; numérotation
  `DEV-AAAA-####` / `FAC-AAAA-####` séquencée par type et par an ;
  `PATCH /invoices/[invoiceId]` — `{action:'convert'}` crée la facture,
  annule le devis, pose `convertedInvoiceId` (transaction + audit) ;
  `{action:'status'}` gère le cycle de vie.
- **Trésorerie** (`lib/business/treasury.ts`) et **objectifs**
  (`lib/business/goals.ts`) : **vues calculées**, jamais stockées comme
  soldes. Trésorerie = encaissements (ventes + factures `INVOICE` payées) vs
  décaissements (dépenses) sur 6 mois + créances (factures `SENT`/`OVERDUE`)
  + note d'autonomie. Objectifs = progression d'un indicateur
  (`REVENUE`/`MARGIN_RATE`/`SALES_COUNT`/`NEW_CUSTOMERS`) sur une période.
- **Export CSV** (`lib/utils/csv.ts`, testé) : téléchargement client, séparateur
  « ; », BOM UTF-8. Exposé sur la liste clients.
- **Front** : `business-detail-client.tsx` gagne les onglets Clients,
  Fournisseurs, Devis & Factures (avec bascule et conversion), Objectifs,
  Trésorerie (mini graphe encaissé/décaissé), ADN. Le formulaire de vente et
  celui de facture proposent un sélecteur de client existant.

### §8 — ADN de l'entreprise
- `lib/business/dna.ts::computeBusinessDNA()` : profil numérique **agrégé à
  partir des données existantes** (identité, activité 30/90 j, panier moyen,
  marge brute, mix par catégorie, produits phares, clients récurrents,
  fournisseurs, objectifs), un **score de santé 0–100** à base de règles
  transparentes (bande `Solide`/`Correcte`/`Fragile`/`À consolider`, signaux
  explicites) et des **recommandations déduites**. Rien n'est inventé —
  chaque chiffre vient des ventes, dépenses, produits, fiches saisis.
- `GET /api/v1/business/[id]/dna` + onglet « ADN ». Sert de base au Business
  Advisor de KESSIA AI.

### §9–§16 — Hub « Explorer » + captation d'intérêt
- `lib/modules/catalog.ts` : catalogue unique — 5 modules **LIVE** (Wallet,
  Tontines, Business, KESSIA AI, KESSIA Score) + 7 **à venir** (Market,
  Academy, Communauté, Jobs → `SOON` ; Invest, Insurance → `REGULATED` ;
  Diaspora → `SOON`).
- **`/explore`** : les modules disponibles en liens directs ; les modules à
  venir présentés honnêtement (« pas encore construits », Phase 8) avec un
  bouton **« M'intéresser »**. Note réglementaire permanente : Invest et
  Insurance seulement après validation, KESSIA n'est pas assureur, aucune
  promesse de rendement.
- `ModuleInterest` (`@@unique([userId, module])`) + `/api/v1/modules/interest`
  (GET/POST/DELETE, valide la clé contre le catalogue).
- **Admin** : `/admin/modules` + `GET /api/v1/admin/modules` → demande agrégée
  par module (KPI de priorisation, données réelles). Entrée ajoutée à la
  navigation du back-office.
- **Liens morts supprimés** : la grille de l'accueil ne pointe plus vers
  `/marketplace`, `/academy`, `/community`, `/analytics`, `/more`
  (routes inexistantes) ; elle expose Wallet, Tontines, Business, KESSIA AI,
  Score et **Explorer**. Idem `Sidebar` (desktop) : `Marketplace → Explorer`.

## Conséquences
- ✅ §4 (parcours), §7 (CRM, fournisseurs, devis, trésorerie, objectifs, CSV),
  §8 (ADN) conformes au périmètre MVP. §9–§16 : rien n'est faussement présenté
  comme disponible ; l'intérêt est mesuré pour prioriser la Phase 8.
- ✅ Aucune donnée financière inventée : trésorerie, objectifs, ADN et
  segmentation sont des calculs sur des données saisies ; le solde du wallet
  et les cagnottes restent la seule source des montants « argent ».
- ⚠️ Les modules `REGULATED` (Invest, Insurance) n'ont ni écran ni API ; seule
  leur fiche descriptive et le bouton d'intérêt existent.
- ⏭️ Phase 8 : construction effective des modules, branchement Tontine Achat ↔
  Market, PDF des devis/factures, relances automatiques.
