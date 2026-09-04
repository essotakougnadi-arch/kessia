# ADR 0040 — Modules de la feuille de route : aperçus simulés (§10–§15)

**Statut :** accepté · **Date :** 2026-09-04

## Contexte

Six modules du cahier des charges restaient au stade « Phase 8 » : KESSIA
Academy (§10), Communauté (§11), KESSIA Jobs (§12), KESSIA Invest (§13),
KESSIA Insurance (§14), KESSIA Global / Diaspora (§15) — visibles sur
`/explore` uniquement comme intitulé + bascule « m'intéresser ». Objectif :
livrer une **expérience complète en simulation** en attendant les
intégrations réelles (partenaires formateurs, modération, employeurs,
partenaires financiers et assureurs habilités, rail de paiement
transfrontalier).

## Décision — deux traitements différents, par nécessité de conformité

### A. Academy, Communauté, Jobs, Diaspora → passent **LIVE**
Aucune de ces quatre fonctionnalités n'implique d'offrir un produit
financier réglementé. Chacune a une page dédiée sous `(dashboard)`,
alimentée par des **données de démonstration statiques**
(`lib/modules/{academy,community,jobs,diaspora}-data.ts`), avec des
actions **simulées côté client** (React state, aucune écriture serveur) :
- **`/academy`** — catalogue de 8 cours (catégories, niveau, durée,
  formateur), filtre par catégorie, « S'inscrire » → barre de progression
  simulée.
- **`/community`** — 6 groupes par secteur, « Rejoindre » (compteur de
  membres mis à jour), fil de publications avec « J'aime ».
- **`/jobs`** — 6 offres (CDI/CDD/Stage/Freelance), filtre par type,
  « Postuler » → confirmation.
- **`/diaspora`** — statistiques de communauté par pays (purement
  informatives, aucun montant) + **données réelles** : les rails
  `DiscoveryRail`/`MarketplaceRail` (mêmes tontines et articles que
  `/discover`) pour montrer ce qu'un membre de la diaspora peut faire
  *aujourd'hui*. Le bloc « Transferts internationaux directs » reste
  honnêtement annoncé comme indisponible (liste d'attente).

Chaque page affiche un bandeau **« Aperçu. »** rappelant que le contenu
réel arrive avec les partenaires. Catalogue (`lib/modules/catalog.ts`) :
`status: 'LIVE'` + `href`.

### B. Invest, Insurance → restent **`REGULATED`**
Décision déjà actée (ADR antérieur, cahier des charges §13/§14) :
« aucune promesse de rendement » / « KESSIA n'est jamais assureur ».
Simuler des offres d'investissement chiffrées (rendement %) ou des primes
d'assurance concrètes présenterait, même en démonstration, quelque chose
qui ressemble à une offre financière réelle — précisément ce que le
statut `REGULATED` interdit. Décision : page dédiée **plus riche qu'une
carte**, mais **sans aucune offre ni montant** :
- explication de ce que le module fera, mention explicite de la
  contrainte réglementaire (reprise du texte déjà validé) ;
- 4 catégories envisagées (icône + description générique, ex.
  « Projets agricoles », « Santé ») — pas de somme, pas de taux ;
- bascule « M'intéresser » (réutilise `ModuleInterest`, inchangée) ;
- pont vers des outils déjà réels et non réglementés : Plan de croissance
  et Simulateurs (Invest), Fonds de Garantie Solidaire (Insurance).

Statut catalogue inchangé (`REGULATED`) ; `href` ajouté pour que
`/explore` propose un lien « En savoir plus → » à côté de la bascule
d'intérêt (`explore-client.tsx`).

### Intérêt hors catalogue
`toggle('diaspora')` aurait échoué : `diaspora` est désormais `LIVE`,
donc plus dans `INTEREST_KEYS` (dérivée des modules non-LIVE). Le
sous-bloc « transferts directs » utilise une clé dédiée hors catalogue,
`diaspora_transfer`, ajoutée explicitement à `INTEREST_KEYS`.

### Navigation
Pages sous `(dashboard)`, ajoutées à `PROTECTED_ROUTES`. **Pas d'entrée
dans la Sidebar/BottomNav** — la maquette produit les classe elle-même en
« Autres fonctionnalités » ; l'entrée reste `/explore` (`Ouvrir →` pour
les 4 LIVE, `En savoir plus →` pour les 2 REGULATED).

### Style partagé
`components/modules/module-page.module.css` — un seul fichier de styles
(carte, grille, filtres, bandeau, hero, fil, stats) réutilisé par les 6
pages, pour éviter 6 feuilles de style redondantes.

## Conséquences
- ✅ `tsc` + `lint` (0 warning) + `vitest` (**172**, +5) + `build` +
  **E2E complet (40/40)** au vert.
- ✅ `/explore` : 14 modules LIVE (dont les 4 nouveaux), 2 REGULATED avec
  lien « En savoir plus ».
- Aucune nouvelle table Prisma : contenu 100 % statique + état client.
  Si un module s'ouvre réellement, ses données de démonstration seront
  remplacées par une vraie API sans changer la structure de page.
- Le choix de ne PAS simuler d'offres Invest/Insurance est une décision
  de prudence réglementaire, cohérente avec le texte déjà présent dans
  le cahier des charges et `explore.roadmapNote` — pas une limitation
  technique.

## Amendement 2026-09-04 — Invest/Insurance enrichis en exemples chiffrés

L'utilisateur, après revue, a explicitement demandé une parité de forme
avec les 4 autres modules (« simulation complète comme les 4 autres »),
y compris des montants d'exemple, tout en acceptant qu'ils soient
marqués comme illustratifs plutôt que comme une offre réelle. Le statut
`REGULATED` du catalogue reste inchangé (`invest`/`insurance`, voir
`catalog.test.ts`) — c'est le **contenu** des deux pages qui est enrichi :

- `lib/modules/invest-insurance-data.ts` : `INVEST_EXAMPLE_PROJECTS` (5
  projets, un par catégorie + un doublon agricole) et
  `INSURANCE_EXAMPLE_PLANS` (5 formules) — chaque montant/pourcentage
  porte **toujours** dans son propre libellé la mention « exemple »,
  « indicatif » ou « non contractuel » (pas seulement dans un bandeau
  externe qu'on pourrait manquer).
- `/invest` : grille filtrable par catégorie, barre de progression de
  financement (illustrative), objectif en FCFA, fourchette de rendement
  visée **toujours qualifiée « indicatif, non garanti »**, action
  « M'intéresser à ce projet » (état local, toast — aucune écriture
  serveur, distincte de la bascule d'intérêt globale du module).
- `/insurance` : grille filtrable par catégorie, garanties (tags),
  prime d'exemple **toujours qualifiée « non contractuel »**, action
  « Voir un exemple de simulation » (toast récapitulatif, aucun calcul
  actuariel réel, aucune souscription possible).
- Bandeau `.banner` sur chaque page répète le disclaimer au niveau page,
  en plus du libellé par carte — défense en profondeur contre une
  lecture partielle qui laisserait croire à une offre réelle.
- `tsc` + `lint` (0 warning) + `vitest` (**172**, inchangé — pas de
  nouvelle logique pure à tester, uniquement des données + JSX) +
  `build` + **E2E complet (40/40)** au vert. Vérifié visuellement
  (Playwright, interaction filtre + action + toast sur les deux pages).
