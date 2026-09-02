# ADR 0012 — Plan de croissance, simulateurs, Opportunity Engine, plan d'affaires

**Statut :** accepté · **Date :** 2026-08-29

## Contexte
Suite des ADR 0010 et 0011. Finalisation, dans la part qui relève du code,
des sections §4 (parcours), §17 (KESSIA AI — assistant contextuel, Business
Plan AI, Opportunity Engine, voix), §19–§20 (Simulator) et §23 (Growth Plan).

**Hors périmètre, documenté comme tel :** le LLM génératif (§17) reste une
dépendance externe non branchée ; **Vision AI (§19)** demande des modèles
d'image et n'est pas construit. Le reste de §17/§19/§20/§23 est réalisable
avec des moteurs de règles et des calculs purs, sans dépendance externe ni
verrou réglementaire.

## Décisions

### §20 — Simulateurs (`/simulator`)
Trois simulateurs, **calculs purs et déterministes** (`lib/simulator/*.ts`,
testés), sans aucune écriture ni appel réseau :
- **Épargne / objectif** (`savings.ts`) : capital de départ + versement
  récurrent + durée → capital projeté, comparaison à un objectif, versement
  mensuel requis. **Aucun intérêt n'est calculé** — KESSIA ne promet aucun
  rendement (règle MASTER PROMPT). Le solde projeté = initial + versé.
- **Tontine** (`tontine.ts`) : réutilise les mécaniques de distribution de
  `lib/tontine/type-meta` — ce que je verse et reçois à chaque tour, le
  calendrier, ma position, le net cumulé (qui revient à zéro sur un cycle
  rotating).
- **Activité** (`business.ts`) : CA + croissance mensuelle visée + marge +
  charges → CA, marge, résultat projetés, seuil de rentabilité, mois de
  passage au vert.
Page à onglets (`?sim=`), sliders, mini-graphes à barres, bannière
« projections, pas des promesses » permanente.

### §23 — Plan de croissance (`/growth`)
- **Modèle** : le plan est *recalculé à chaque visite* ;
  seule la progression est persistée (`GrowthStepState` : `userId + stepKey`
  unique, statut `TODO/DOING/DONE/SKIPPED`, note).
- `lib/growth/rules.ts` (**pur, testé**) : `buildGrowthSteps(signals)` →
  étapes déterministes à partir de signaux (KYC, 2FA, opérations wallet,
  tontines actives, cotisations en retard, et **par entreprise** : ventes
  saisies, marge brute, stock faible, clients récurrents, devis ouverts,
  objectifs, fournisseurs). Chaque étape porte : catégorie, objectif,
  action + lien, **indicateur de suivi**, cible, échéance suggérée, impact.
- `lib/growth/plan.ts` : rassemble les signaux (dont `computeKessiaScore` et
  la logique de palier de bande), fusionne `GrowthStepState`, trie
  (DOING > TODO par impact > DONE > SKIPPED), calcule la progression et un
  titre de synthèse.
- `GET /api/v1/growth`, `PATCH /api/v1/growth/steps/[key]` (`{status, note?}`,
  audité `growth.step_updated`). Écran `/growth` (anneau de progression,
  étapes groupées, actions Fait / En cours / Ignorer, lien vers le Score).
- Convergence des conseils du KESSIA Score (§6.6) et des besoins de l'ADN
  d'entreprise (§8) en **un plan actionnable unique**.

### §17 — KESSIA AI
- **Opportunity Engine** (`lib/opportunities/engine.ts`) : opportunités
  **concrètes tirées des données propres** de l'utilisateur — tontines
  publiques ouvertes et abordables, devis à relancer (avec montant),
  clients dormants à réactiver, réassort d'un produit rentable en stock
  faible, produit à marge trop faible, palier de Score à franchir. Chaque
  opportunité cite un fait vérifiable et, quand c'est pertinent, un montant
  estimé. `GET /api/v1/opportunities`. Surfacée sur l'accueil et dans
  KESSIA AI.
- **Business Plan AI** (`lib/business/plan.ts` + modèle `BusinessPlan`,
  un par entreprise) : `generateBusinessPlanDraft()` produit un **brouillon
  structuré** (résumé, clientèle cible, offre, différenciation, canaux,
  structure de coûts, prévisionnel 3 mois, risques, prochaines actions) à
  partir de l'ADN, de la trésorerie, des objectifs et des fiches réels.
  `GET/PUT/POST /api/v1/business/[id]/plan` (générer / éditer / régénérer,
  audité). Onglet « Plan » sur `/business/[id]`, sections éditables, export
  texte.
- **Assistant contextuel data-aware** (`lib/ai/data-answers.ts`) : avant la
  base de connaissances, l'assistant répond à des questions **factuelles**
  avec les données réelles (solde, prochaine cotisation, Score, ventes du
  mois, plan de croissance, opportunités). Toute valeur financière vient du
  backend ; sinon repli sur la base de connaissances (enrichie : plan de
  croissance, simulateurs, CRM, ADN, Explorer, opportunités).
- **Voix** (`hooks/useVoice.ts`, Web Speech API, 100 % navigateur) : dictée
  de la question (bouton micro) et lecture vocale des réponses (bascule),
  en français, activées seulement si le navigateur les supporte. Aucune
  dépendance externe. Avance aussi §34 (inclusion).

### §4 — Parcours
- `lib/user/user-type.ts` : `firstSteps` et `aiPrompts` par profil pointent
  désormais vers le simulateur et le plan de croissance selon le profil.
- Accueil : sections **« Plan de croissance »** (2 étapes actives + % de
  progression) et **« Opportunités »** (3 opportunités + montant estimé) ;
  grille de services + Croissance + Simuler.
- `lib/modules/catalog.ts` : `growth` et `simulator` ajoutés aux modules
  **LIVE** (visibles dans `/explore`).

## Conséquences
- ✅ §20 (simulateurs) et §23 (plan de croissance) conformes au périmètre
  MVP. §17 : assistant contextuel + Business Advisor + Business Plan AI +
  Opportunity Engine + voix livrés ; seul le LLM génératif reste à brancher.
- ✅ Aucune donnée financière inventée : les simulateurs projettent des
  hypothèses saisies (et n'ajoutent aucun rendement), le plan et les
  opportunités sont calculés sur des données réelles.
- ⚠️ Vision AI (§19) non construit — dépendance modèles d'image.
- ⏭️ À l'activation d'un LLM : le mode règles reste le repli ; la couche
  data-aware et les garde-fous (jamais de solde inventé) s'appliquent aussi
  aux réponses génératives.
