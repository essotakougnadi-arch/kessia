# ADR 0024 — i18n : Business + Explorer (§38)

**Statut :** accepté · **Date :** 2026-08-31

## Contexte
Après la landing et le cœur du tableau de bord (ADR 0020→0023), les deux gros
morceaux restants du parcours utilisateur étaient **Business** (liste + détail
à 11 onglets, ~1300 lignes, ~200 chaînes) et **Explorer** (hub des modules).

## Décision
Même méthode. `fr.ts` source de vérité + `en.ts` miroir, `useT()` dans chaque
composant client.

### Écrans câblés
- `business-client.tsx` (liste) — en-tête, KPI agrégés, actions rapides, cartes
  d'activité, CTA, formulaire de création (secteurs via `business.sectors.*`).
- `business-detail-client.tsx` — les 11 onglets (Résumé, Clients, Fournisseurs,
  Produits, Ventes, Dépenses, Devis & Factures, Objectifs, Trésorerie, ADN,
  Plan), leurs KPI, états vides, filtres, et les **7 formulaires modaux**
  (produit, vente, dépense, devis/facture, client, fournisseur, objectif) :
  labels, placeholders, erreurs de validation, boutons, interpolations
  (`{count}`, `{date}`, `{amount}`, `{name}`…).
- `explore-client.tsx` — page + section « Disponible » / « Feuille de route »,
  bouton « M'intéresser », note réglementaire.

### Surcouches par hook (source FR intacte pour le serveur)
- **`lib/modules/i18n.ts`** (`useModuleCatalog()`) : localise
  `name` / `tagline` / `description` des ~16 modules + `STATUS_LABEL`.
  `lib/modules/catalog.ts` reste FR — consommé par `/admin/modules` (serveur)
  et les routes d'intérêt.

### Énums localisés côté client (via le catalogue, pas le serveur)
- Statut de facture (`InvoiceStatus`), segment client (`CustomerSegment`),
  indicateur / période d'objectif (`GoalMetric` / `GoalPeriod`), moyen de
  paiement, catégories de dépense, secteurs. On lit l'énum brut porté par la
  donnée (`g.metric`, `c.segment`, `inv.status`…) plutôt que le libellé
  pré-calculé côté serveur (`g.metricLabel`…).

### Volontairement HORS périmètre
- **Texte dérivé calculé côté serveur** : bandes de santé de l'ADN
  (`health.band`), signaux (`health.signals[]`), recommandations (`needs[]`),
  note de runway (`runwayNote`), libellés de mois de trésorerie (`m.label`),
  titres des sections du plan d'affaires (`PLAN_SECTIONS[].label`). Le serveur
  ne connaît pas la locale (persistée côté client) → une vraie i18n serveur
  est une décision distincte.
- `lib/user/user-type.ts` (`userTypeMeta().label` / `firstSteps` / `aiPrompts`)
  — touche home + ai + profil + register, passe dédiée.
- Le back-office `/admin/*` (dont `/admin/modules`) — reste FR.
- Éwé : `business` / `explore` retombent en FR (relecture native requise).

## Conséquences
- ✅ Business (liste + détail + formulaires) et Explorer s'affichent
  entièrement en anglais, hors prose analytique générée côté serveur.
- ✅ `tsc` + `lint` (0 warning) + `vitest` (112, dont `catalogs.test.ts`) +
  `build` + `playwright` (36) + `db:seed` au vert. E2E inchangés
  (locale par défaut `fr` ; `explore-crm.spec` cherche du texte FR).
- ⏭️ Reste : trust / croissance / simulateur, back-office, écrans profil
  secondaires, `user-type.ts`, la prose analytique serveur, et l'éwé natif.
