# ADR 0025 — i18n : Trust Center, croissance, simulateurs, assistant (§38)

**Statut :** accepté · **Date :** 2026-08-31

## Contexte
Suite du grind i18n (ADR 0020→0024). Restaient quatre écrans membres :
**Trust Center** (§21), **plan de croissance** (§23), **simulateurs** (§20),
et l'écran **KESSIA AI** (§17). Après cette passe, tous les écrans destinés à
l'utilisateur final sont traduits FR / EN.

## Décision
Même méthode. `fr.ts` + `en.ts`, `useT()` dans chaque composant client.

### Écrans câblés
- `trust-client.tsx` — titres de section, pastilles (2FA, à jour), libellés de
  lignes, liens, interpolations (`{used}`, `{remaining}`, `{amount}`,
  `{version}`, `{date}`).
- `growth-client.tsx` — en-tête, méta (`{done}/{total}` étapes), boutons de
  statut (En cours / Fait / Ignorer), échéances, bascule « étapes ignorées »,
  disclaimer, toast « Plan mis à jour ».
- `simulator-client.tsx` — les 3 onglets, tous les labels de champ, les
  résultats et les callouts (objectif atteint/manqué, seuil de rentabilité…).
  `TONTINE_TYPES` (FR) remplacé par `useTontineTypeList()` (ADR 0022) ;
  `FREQ_LABEL` local remplacé par `formatFrequency()` (ADR 0023).
- `ai-client.tsx` — statut « En ligne », boutons voix / effacer, bannière
  capacités, titres des bannières opportunités / insights, « Suggestions »,
  placeholder, footer, toast de commande vocale, questions par défaut.

### `lib/simulator/tontine.ts` — descripteur au lieu de la phrase
`simulateTontine()` est une fonction pure. Son `positionNote` (5 branches, FR)
gagne un compagnon **`positionKind`** (`'growth' | 'projectOrganizer' |
'projectContributor' | 'rotatingEarly' | 'rotatingLate' | 'rotatingMid'`) +
`myPosition`. L'écran reconstruit la phrase via `t()` selon le `kind`.
`positionNote` (FR) est conservé — inoffensif, aucun test ne le vérifie.

### Volontairement HORS périmètre
- **Prose calculée côté serveur** : `trust.fees[].label/detail/fee`,
  `trust.kyc.limits.label`, `trust.disclaimers[]`, `trust.guaranteeFund.note`
  (source `lib/fees.ts` + hook trust) ; `plan.headline`, `step.title/why/
  categoryLabel/metricLabel/targetHint/actionLabel`, `score.bandLabel`
  (source `lib/growth/`) ; opportunités et insights de l'assistant. Le serveur
  ne connaît pas la locale — i18n serveur = décision distincte.
- `lib/user/user-type.ts` (`aiPrompts` affichés dans l'assistant) — passe
  dédiée.
- Back-office `/admin/*`, écrans profil secondaires. Éwé.

## Conséquences
- ✅ Trust Center, plan de croissance, simulateurs et assistant s'affichent en
  anglais, hors prose analytique serveur. **Tous les écrans utilisateur sont
  désormais FR / EN.**
- ✅ `tsc` + `lint` (0 warning) + `vitest` (112) + `build` + `playwright` (36)
  + `db:seed` au vert. E2E `trust-fraud-calendar` cherche les titres FR
  (« Grille tarifaire », « Vos plafonds », « Mentions réglementaires ») —
  inchangés car locale par défaut `fr`.
- ⏭️ Reste : `user-type.ts`, back-office, écrans profil secondaires, la prose
  analytique serveur (une vraie i18n serveur), et l'éwé natif.
