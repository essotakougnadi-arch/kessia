# ADR 0023 — i18n : landing + libellés des utilitaires de formatage (§38)

**Statut :** accepté · **Date :** 2026-08-30

## Contexte
ADR 0020–0022 ont traduit le parcours d'authentification, la navigation et les
écrans du tableau de bord les plus consultés. Deux angles morts restaient sur
le **chemin principal** :

1. La **landing** (`app/page.tsx`) — première page vue, entièrement FR en dur.
2. Les **libellés des utilitaires de formatage** (`lib/utils/format.ts`) —
   `describeTransaction()`, `formatRelativeDate()`, `TONTINE_FREQ_LABELS` —
   consommés par ~20 écrans (wallet, home, business, notifications, support,
   admin…) : tant qu'ils sont FR, l'anglais reste incomplet partout.

## Décision

### 1. Utilitaires de formatage — injection depuis le provider
`lib/utils/format.ts` expose des **fonctions pures**, pas des hooks (utilisées
côté serveur comme client). On garde ce contrat : un singleton module
`MESSAGES: FormatMessages` (défaut FR) est **poussé par le provider i18n** via
`setFormatMessages()`, sur le même modèle que `setFormatLocale()` déjà en place.

- `FormatMessages` = `{ justNow, minutesAgo ({n}), today ({time}), yesterday
  ({time}), freq: Record<Freq>, tx: Record<TxType> & { fallback } }`.
- `I18nProvider` : `useEffect([locale])` appelle
  `setFormatMessages(buildFormatMessages(t))` — résout chaque clé
  `format.*` du catalogue courant.
- `formatRelativeDate()` : les mots-charnière (« À l'instant », « Il y a N
  min », « Aujourd'hui », « Hier ») passent par `MESSAGES` + interpolation ;
  le jour/mois/heure restent pilotés par `Intl` (déjà locale-aware).
- `describeTransaction()` : icônes figées (`TX_ICONS`), libellé depuis
  `MESSAGES.tx`.
- `TONTINE_FREQ_LABELS` conservé (déprécié, pointe sur les valeurs FR) ;
  nouveau `formatFrequency(freq)` localisé. `tontine-detail-client` bascule
  dessus (le `t` local y désigne la tontine, pas la fonction de traduction).
- **Côté serveur** (pages `app/admin/**`), le singleton n'est jamais muté →
  reste FR. Cohérent avec le périmètre (back-office non traduit).

### 2. Landing — split serveur / client
`app/page.tsx` reste un composant serveur qui n'exporte que `metadata`
(FR — la locale est persistée côté client, le serveur ne peut pas la
connaître ; marché principal Togo) et rend `<LandingClient />`.
`app/landing-client.tsx` (nouveau, `'use client'`) câble `useT()` sur
**tout le contenu** : nav, hero, tagline, CTA, signaux de confiance, aperçu
d'app, piliers, 6 fonctionnalités, « Commencer en 3 minutes », section CTA,
pied de page (3 colonnes + mentions). Bloc catalogue `landing.*` (~70 clés)
dans `fr.ts` + `en.ts`.

Les montants de l'aperçu d'app (`135 750 FCFA`…) restent en dur — contenu
purement décoratif, pas de la copie.

## Conséquences
- ✅ Le **chemin onboarding → wallet → tontine → business** s'affiche
  intégralement en anglais, libellés d'utilitaires compris.
- ✅ La landing est traduite FR / EN.
- ✅ `tsc` + `lint` (0 warning) + `vitest` (**112**, +3 sur `format.test.ts`
  couvrant `setFormatMessages`) + `build` + `playwright` (36) + `db:seed` au
  vert. E2E inchangés (locale par défaut `fr`).
- ⏭️ Reste : business / explorer, trust / croissance / simulateur, back-office,
  écrans profil secondaires, `<metadata>` par locale (si SSR-locale un jour),
  et la relecture native de l'éwé.
