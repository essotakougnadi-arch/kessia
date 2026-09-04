# ADR 0035 — Deux couleurs d'accent au choix + Tontine Achat individuelle (§36, §6.4)

**Statut :** accepté · **Date :** 2026-09-02

> **Amendement 2026-09-04** — la 2ᵉ teinte devient **Violet `#5B34D6`**
> (au lieu de « Brique » `#C84B1E`, trop proche de la terracotta pour
> que le changement soit perceptible). Le sélecteur quitte la modale
> enfouie du profil pour une **carte inline « Couleur de l'application »**
> avec 2 grandes tuiles cliquables, placée en haut de `/profile`.
> `AccentChoice = 'terracotta' | 'violet'`, `data-accent="violet"`.
> Bloc CSS `:root[data-accent='violet']` (+ variantes sombres). Quelques
> dégradés codés en dur (`.balanceCard` accueil/wallet, `.progressFill`,
> `.profileHero`) repassés sur les tokens `--gradient-*` / `--color-primary`
> pour qu'ils suivent l'accent. `navigation.spec.ts` mis à jour.

## Contexte
Deux demandes utilisateur :
1. Rendre disponibles **les deux teintes signature** de KESSIA — la
   terracotta actuelle `#B65A3A` et la teinte d'origine `#C84B1E` — et
   laisser chaque personne choisir.
2. Dans la **tontine Achat** (§6.4), ajouter une formule **individuelle** :
   une personne épargne seule, pour son propre article, via le mécanisme
   de tontine — l'argent bloqué jusqu'au bout, puis recrédité pour acheter.

## Décision

### 1 — Couleur d'accent : préférence utilisateur `data-accent`

- `store/accentStore.ts` : `AccentChoice = 'terracotta' | 'brique'`, persisté
  (`kessia-accent`), appliqué via l'attribut `data-accent` sur `<html>` —
  `terracotta` (défaut) = **aucun attribut** (valeurs de `:root`).
- `ACCENT_INIT_SCRIPT` inline dans `app/layout.tsx` (avant le paint, comme
  le thème) → pas de flash de couleur.
- `app/globals.css` : bloc `:root[data-accent='brique']` **après** le dark
  mode, qui surcharge toute la famille `--color-primary*`, les 4 gradients,
  `--color-border-focus`, `--color-surface-hover/-pressed` et les ombres
  teintées. Deux surcharges `[data-theme='dark'][data-accent='brique']` +
  `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])[data-accent='brique']`
  réajustent les nuances translucides sombres. Aucune couleur définie
  uniquement sous media/`[data-*]`.
- `/profile` : nouvelle entrée « Couleur d'accent » (🖌️) + modale avec
  pastille de couleur, à côté d'« Apparence ». Catalogue `profile.menu.accent`
  + `profile.accent.*` + `profile.accentHint.*` FR + EN.
- **Hors périmètre** (volontaire) : `viewport.themeColor`, le manifest et la
  landing mono-thème restent sur la teinte signature — chrome de marque, pas
  d'UI applicative.

### 2 — Tontine Achat : `GROUP` (défaut) ou `SOLO`

**Schéma** (`db push`) : `enum PurchaseMode { GROUP SOLO }` ;
`Tontine += purchaseMode PurchaseMode @default(GROUP)`, `purchaseItem String?`,
`targetAmount Decimal?`. Aucune nouvelle table.

**Logique partagée** (`lib/tontine/type-meta.ts`) :
- `DistributionMode += 'solo'`.
- `resolveDistribution(type, purchaseMode)` : `PURCHASE` + `SOLO` → `'solo'`,
  sinon `tontineTypeMeta(type).distribution` (le sous-mode n'affecte que la
  tontine Achat). Toutes les branches serveur passent par cette fonction au
  lieu de `meta.distribution` en dur.
- `soloContributionAmount(target, rounds)` = `round(target / rounds)`,
  plancher 1, 0 si entrée invalide. **Décision produit** : la personne saisit
  le **prix de l'article** et le **nombre de versements** ; KESSIA calcule
  chaque échéance (le léger surplus d'arrondi lui reste).
- `totalRoundsForType(type, memberCount, { purchaseMode, plannedRounds })` :
  solo → `plannedRounds` (pas le nombre de membres).

**Orchestrateur** (`lib/tontine/orchestrator.ts`) :
- `activateTontine` : garde « ≥ 2 membres » **levée pour solo** (1 membre
  suffit) ; `totalRounds` conservé tel quel (fixé à la création).
- `checkAndAdvanceRound` : le mode `solo` **réutilise le chemin de
  restitution `growth`** — N versements en séquestre, puis au dernier tour
  `postDoubleEntry` séquestre → wallet de l'unique membre pour la totalité
  détenue, avec la même garde « jamais plus que détenu » (§6.5) et la même
  clé idempotente `TPAYOUT-<id>-final-<memberId>`. Notifications et libellés
  ledger propres au solo (« Épargne achat débloquée — <article> »).
- `settleContribution` / `reconcileTontineEscrow` : inchangés — l'invariant
  `held == Σ PAID − Σ totalReceived` tient naturellement.

**Contrat numérique** (`lib/tontine/agreement.ts`) : `distribution: 'solo'`,
règle de distribution dédiée (séquestre → déblocage), calendrier « aucun
versement / déblocage au dernier ».

**API** (`app/api/v1/tontine/route.ts`) : `createTontineSchema` + `superRefine`
(solo exige `targetAmount` + `plannedRounds` + `purchaseItem` ; groupe exige
`maxMembers ≥ 2`). Handler : pour solo → `maxMembers = 1`, `isPublic = false`,
`amount` re-dérivé serveur, `totalRounds = plannedRounds`.
`POST /tontine/join` refuse explicitement un plan solo.

**UI** :
- `/tontine` — formulaire : sélecteur **En groupe / Individuel** (visible
  seulement pour Achat), champs solo (article, prix, nombre de versements) +
  aperçu « ≈ X par versement · total Y » + note séquestre. Carte de liste :
  badge « Plan individuel », objectif = prix de l'article, pas de « mon tour ».
- `/tontine/[id]` — bouton « Démarrer mon plan d'achat » sans condition de
  membres ; actions Inviter/Partager masquées ; ligne séquestre « bloqués
  pour votre achat » ; carte principale « Objectif / Versements / Par
  versement » ; historique des cycles masqué ; à la clôture, encart
  « Achat finançable ».
- Catalogue `tontine.*` (~20 clés) + `tontineDetail.*` (~14 clés) FR + EN.
- `tontineType.PURCHASE.*` réécrit (deux formules).

**Seed** : `seedTontine` accepte `purchaseMode`/`purchaseItem`/`targetAmount`/
`plannedRounds` ; 1 plan solo `PENDING` ajouté (Kossi — presse à jus,
180 000 FCFA / 6 versements).

## Conséquences
- ✅ `tsc` + `lint` (0 warning) + `vitest` (**147**, +4 : `resolveDistribution`,
  `totalRoundsForType` solo, `soloContributionAmount`, contrat solo) + `build`
  + **`test:integration`** (nouveau `tontine-solo.itest.ts` : activation 1
  membre, séquestre = Σ versements, restitution intégrale au dernier, rejeu
  sans double restitution ; garde groupe « ≥ 2 » toujours active) +
  **E2E 40/40** (+ création plan solo, + bascule couleur Brique persistée) +
  `db:seed`.
- ✅ La tontine Achat couvre les deux usages sans nouveau type ni table.
- ✅ Le solo hérite gratuitement du séquestre (§6.5), de la double écriture
  atomique, du verrou de ligne et de la réconciliation.
- ⏭️ Non fait, par choix : theming de la landing / du chrome PWA (marque),
  simulateur de plan solo (le simulateur reste « groupe »).
