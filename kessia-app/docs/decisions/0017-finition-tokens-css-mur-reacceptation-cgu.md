# ADR 0017 — Finition : jetons CSS cassés, mur de ré-acceptation des CGU

**Statut :** accepté · **Date :** 2026-08-29

## Contexte
Lot « qualité & dette » après ADR 0016 :
- Un bug de longue date était consigné : `tontine-detail.module.css` (et deux
  autres fichiers) référençaient des jetons CSS **inexistants**
  (`--color-text-primary`, `--color-surface-2`, `--color-text-muted`) → texte
  et fonds sans couleur résolue, cassés en particulier en mode sombre.
- ADR 0016 a introduit le versionnage de l'acceptation des CGU mais **sans mur
  de ré-acceptation** : rien ne se passait quand un utilisateur avait accepté
  une version périmée.

## Décisions

### 1. Jetons CSS — correction des références mortes
- `--color-text-primary` → `--color-text`
- `--color-text-muted` → `--color-text-tertiary`
- `--color-surface-2` → `--color-earth`
- Fichiers : `app/(dashboard)/tontine/[id]/tontine-detail.module.css`,
  `app/(dashboard)/notifications/notifications.module.css`,
  `app/(auth)/verify-otp/verify-otp.module.css`.
- Ces trois jetons cibles sont définis dans les **trois états** de thème
  (`:root`, `:root[data-theme='dark']`, `@media (prefers-color-scheme: dark)`),
  donc l'adaptation clair / sombre est désormais correcte sur ces écrans.
- Passes de cohérence mineures : badges de catégorie des notifications
  (`.cat_*`) sur jetons `--color-*-light` / `--color-*` ; hover du bouton
  d'action de la tontine sur `--color-primary-pressed` ; points d'état sur
  `--color-success`.
- **Non traité volontairement** : le hex en dur du reste de l'app est
  intentionnel — panneaux de marque volontairement sombres (auth, en-tête
  profil), texte blanc sur fond terracotta / vert (correct dans les deux
  thèmes), fond blanc obligatoire des QR codes, accent « violet IA »
  distinct de la marque. La landing (`page.module.css`) est un design
  volontairement mono-thème (clair) — assumé, non « cassé ».

### 2. Mur de ré-acceptation des CGU (§8)
- `lib/legal/versions.ts` : `isTermsUpToDate(acceptedVersion)` — helper pur,
  testé (`versions.test.ts`, 3). Une version absente est périmée.
- `GET/POST /api/v1/legal/acceptance` :
  - `GET` → `{ acceptedVersion, acceptedAt, currentVersion,
    currentVersionLabel, upToDate, documents }`.
  - `POST` → pose `termsAcceptedVersion = LEGAL_VERSION`, `termsAcceptedAt =
    now`, audit `legal.terms_accepted` (`context: 'reacceptance'`).
- `components/legal/LegalGate.tsx` : monté dans `app/(dashboard)/layout.tsx`.
  Tant que `upToDate` est faux, panneau **bloquant** (`role="dialog"`,
  `aria-modal`) : rappel de la version, liens vers les trois documents,
  case à cocher obligatoire, bouton « Continuer » (→ `POST`), et
  « Se déconnecter » en secours. Ne rend rien tant que l'état n'est pas
  connu ou si l'utilisateur est à jour.
- `GET /api/v1/trust` réutilise `isTermsUpToDate` (comportement inchangé).

## Conséquences
- ✅ Bug jetons CSS fermé ; `docs/progress/status.md` « écarts nommés » nettoyé.
- ✅ §8 complété : le versionnage **et** son application (ré-acceptation forcée)
  sont en place.
- ✅ `tsc` + `lint` (0 warning) + `vitest` (**101**) + `build` + `playwright`
  (33) au vert. Les comptes de démonstration acceptent déjà la version en
  vigueur → `LegalGate` ne s'affiche pas, aucun E2E impacté.
- ⏭️ Reste : table d'historique des acceptations (si un régulateur l'exige) ;
  tokenisation complète des `.module.css` de la landing si un thème sombre
  y devient souhaité.
