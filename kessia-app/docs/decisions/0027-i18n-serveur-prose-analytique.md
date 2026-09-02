# ADR 0027 — i18n serveur : prose analytique (§38)

**Statut :** accepté · **Date :** 2026-08-31

## Contexte
Après ADR 0020→0026, tout l'espace membre est bilingue **sauf** le texte
généré côté serveur : KESSIA Score (bandes, facteurs, conseils), ADN
d'entreprise (santé, signaux, besoins), plan de croissance (étapes). Le
serveur ignorait la locale choisie par l'utilisateur (persistée côté client
dans `localStorage`).

## Décision

### Infrastructure
- **`lib/i18n/core.ts`** (nouveau, sans dépendance React) : `CATALOGS`,
  `resolve()`, `interpolate()`, `makeTranslate(locale)` → `(key, vars?) =>
  string` avec repli locale → fr → clé. `index.tsx` réutilise ce cœur.
- **`lib/i18n/server.ts`** (nouveau) : `getServerLocale()` lit le cookie
  `kessia-locale` via `next/headers`, `serverT()` renvoie un traducteur lié à
  la locale de la requête. Hors contexte de requête (tests, scripts), retombe
  silencieusement sur le français.
- **`I18nProvider`** écrit désormais la locale dans le cookie `kessia-locale`
  (en plus du `localStorage`), à chaque changement et au rattrapage post-
  montage. Le middleware n'est pas touché.

### Générateurs câblés
- **`lib/score/score.service.ts`** — `bandLabel`, les 9 `factors[].label`, tous
  les `factors[].detail` (avec interpolation `{level}` / `{months}` / `{count}`
  / `{onTime}` / `{late}` / `{businesses}` / `{sales}`), les `advice[]`.
- **`lib/business/dna.ts`** — `health.band` (4 bandes), `health.signals[]`,
  `needs[]`, la catégorie de repli.
- **`lib/growth/rules.ts`** — `buildGrowthSteps(signals, t)` prend désormais un
  traducteur ; les ~15 étapes (titre, « pourquoi », action, indicateur, cible)
  passent par `srvGrowth.step.*`. `GROWTH_CATEGORY_LABEL` (const) →
  `growthCategoryLabel(t, cat)`.
- **`lib/growth/plan.ts`** — `headline` + `categoryLabel` via `serverT()`.

Blocs catalogue `srvScore.*`, `srvDna.*`, `srvGrowth.*` dans `fr.ts` + `en.ts`.

### Split client / serveur
`lib/business/plan.ts` (serveur : `generateBusinessPlanDraft`) importait
transitivement `dna.ts` → `server.ts` → `next/headers`, ce qui cassait le
bundle de `business-detail-client.tsx` (qui n'a besoin que de
`PLAN_SECTIONS`). Extraction dans **`lib/business/plan-shared.ts`** (types +
constantes, sans dépendance serveur). `plan.ts` le re-exporte.

### Volontairement HORS périmètre
- **Opportunités** (`lib/opportunities/engine.ts`), **insights**
  (`lib/insights/insights.service.ts`), **frais** (`lib/fees.ts`), notes de
  trésorerie (`lib/business/treasury.ts`) — mêmes rails, passe suivante.
- Back-office `/admin/*`. Éwé.
- `PLAN_SECTIONS[].label` (titres du plan d'affaires) restent FR.

## Conséquences
- ✅ KESSIA Score, ADN et plan de croissance s'affichent en anglais quand
  l'utilisateur a choisi l'anglais — sans passer de `locale` en paramètre à
  travers toute la chaîne d'appels (chaque générateur lit le cookie).
- ✅ `tsc` + `lint` (0 warning) + `vitest` (112 — `rules.test.ts` passe un
  `makeTranslate('fr')`) + `build` + `playwright` (36) + `db:seed` au vert.
  E2E inchangés (pas de cookie `kessia-locale` → FR).
- ⏭️ Reste : opportunités / insights / frais / trésorerie, le back-office, et
  l'éwé natif.
