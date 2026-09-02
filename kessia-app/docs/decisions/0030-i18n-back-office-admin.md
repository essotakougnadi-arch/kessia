# ADR 0030 — i18n back-office `/admin/*` (§38, dernier bloc)

**Statut :** accepté · **Date :** 2026-08-31

## Contexte
ADR 0020→0028 ont rendu bilingue tout l'espace membre + toute la prose serveur
destinée au membre. Restait le back-office staff `/admin/*` (~17 fichiers TSX),
seul en français. Impact utilisateur nul (usage interne), mais c'était le dernier
bloc qui empêchait de marquer §38 = 🟢. L'audit du 31/08 le listait en action 2.

## Décision
Mêmes rails que l'espace membre — aucune architecture nouvelle.

- **Bloc catalogue `admin.*`** dans `fr.ts` (source) + `en.ts` : ~230 clés,
  regroupées par écran (`nav`, `guard`, `pill`, `dashboard`, `users`, `kyc`,
  `transactions`, `tontines`, `support`, `guarantee`, `fraud`, `modules`,
  `analytics`, `priorities`). `catalogs.test.ts` garantit la parité en/ee ⊆ fr.
- **`app/admin/layout.tsx`** reste serveur (export `metadata`). La sidebar
  (logo, nav, footer) est extraite dans **`app/admin/sidebar.tsx`** (`'use
  client'`, `useT()`), `NAV_ITEMS` porte désormais une `key` au lieu d'un
  `label`.
- **`app/admin/pills.tsx`** — les 4 helpers (`kycPill`/`ticketPill`/`txPill`/
  `tontinePill`) prennent un premier paramètre `t: Translate` ; la classe CSS
  reste dans un map local, le libellé vient de `admin.pill.<groupe>.<statut>`.
  Import `type Translate` depuis `@/lib/i18n/core` (aucune dépendance
  `next/headers`, safe client).
- **10 écrans client** (`'use client'` déjà) + `AdminGuard.tsx` +
  `dashboard-client.tsx` : `useT()` en tête, chaînes littérales → clés.
  Interpolation `{n}` / `{count}` / `{volume}` pour les compteurs.
  `dashboard-client` : `KYC_STYLE` perd son `label` (→ `admin.pill.kyc.*`).
  `analytics/page.tsx` : `fcfa()` local → `formatCurrency()`, `toLocaleString
  ('fr-FR')` → `formatDate()` (déjà locale-aware, ADR 0023).
- **Prose serveur** — `lib/admin/copilot.ts` (`computeAdminPriorities()`,
  6 priorités du jour) passe par `serverT()` : bloc `admin.priorities.*`.
  `lib/analytics/platform.ts` ne contient **aucune** prose (agrégats purs) —
  rien à traduire, les libellés sont dans `analytics/page.tsx`.
- **`e2e/admin.spec.ts`** — regex `M'assigner` → `M['’]assigner` (le catalogue
  utilise l'apostrophe typographique, house style).

## Conséquences
- ✅ **§38 i18n = 🟢** : tout l'espace membre + tout le back-office + toute la
  prose serveur sont FR/EN. Restent hors périmètre, documentés : la relecture
  native de l'éwé (finance/légal/KYC) et les pages `/legal/*` (à traduire après
  validation juridique du texte FR — ADR non bloquant).
- ✅ `tsc` + `lint` (0 warning) + `vitest` (119) + `build` au vert.
  `admin-rbac.itest.ts` (3) au vert — la garde RBAC est intacte.
- ⚠️ e2e `admin.spec` : le heading du dashboard passe ; les 2 tests
  data-dépendants ont échoué sur une **indisponibilité Supabase** au moment du
  run (P1001 confirmé sur `db:seed` et les tests d'intégration au même
  moment ; le snapshot DOM prouve que l'UI admin rend correctement et
  entièrement localisée). À rejouer une fois la base rétablie.
- Les codes d'enum bruts restent affichés tels quels quand ce sont des
  identifiants que le staff reconnaît (type de transaction, type de tontine,
  code de statut module) ; les libellés humains (risque fraude, statut de
  demande de garantie, statut de ticket/KYC) sont traduits.
