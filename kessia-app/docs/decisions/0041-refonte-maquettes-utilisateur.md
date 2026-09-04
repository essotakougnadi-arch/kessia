# ADR 0041 — Refonte visuelle & fonctionnalités manquantes d'après les maquettes utilisateur

**Statut :** en cours · **Date de début :** 2026-09-04

## Contexte

L'utilisateur a fourni 4 planches de maquettes (« KESSIA – parcours complet »)
couvrant l'essentiel de l'application : onboarding, tableau de bord, wallet,
tontines, business, marketplace, communauté, academy, IA, invest, insurance,
jobs, profil, score, notifications — plus quelques écrans qui n'existent pas
encore dans KESSIA (messagerie/appel vidéo, panier marketplace, code PIN,
certificats, objectif d'épargne libre, crowdfunding, prêts coopératifs).

Consigne (après clarification, cf. échange utilisateur) :
> « Ne change rien à ce qui a été déjà fait jusqu'aujourd'hui mais ajoute ce
> qui est sur les images envoyées et qui ne se trouve pas encore sur
> l'application (Ex: Chat dans la Communauté, etc). Ne duplique pas si une
> fonctionnalité existe déjà. Fait moi une organisation propre et parfaite. »

## Décision

Deux chantiers distincts, menés progressivement (« prends ton temps ») :

1. **Refonte visuelle** des écrans existants pour se rapprocher du style des
   maquettes (cartes, hiérarchie, icônes) — **sans changer la logique**
   (API, données réelles, permissions). Périmètre détaillé et priorisé en
   4 phases dans le plan de travail (document de travail partagé avec
   l'utilisateur, non versionné — cf. section « Suivi »).
2. **Construction des fonctionnalités absentes**, dans le même esprit que
   les modules « Phase 8 » déjà livrés (ADR 0040) : des expériences
   **simulées et honnêtes** (bandeau d'aperçu explicite, aucune donnée
   fabriquée présentée comme réelle) plutôt qu'une infrastructure lourde
   non justifiée pour une démonstration.

Couleurs **inchangées** : Terracotta `#B65A3A` reste la couleur par défaut ;
Violet `#5B34D6` reste le second choix dans le profil.

## Règle de traitement par fonctionnalité manquante

Pour chaque écran absent identifié dans les maquettes, le niveau de
réalisme dépend du coût réel d'une version fonctionnelle :

- **Faible risque / faible effort** → construit directement (ex. écran de
  succès post-inscription, jauges, regroupements de navigation).
- **Infrastructure temps réel non justifiable pour une démo** (messagerie
  live, visio) → **simulé côté client**, bandeau explicite « aperçu, pas
  d'interlocuteur réel », strictement dans l'esprit d'ADR 0040.
- **Activité financière réglementée** (prêts, crédit) → même traitement
  que KESSIA Invest/Insurance (ADR 0040) : catégories + exemples chiffrés
  qualifiés, jamais un octroi réel.
- **Chevauchement avec une fonctionnalité existante** (ex. « objectif
  d'épargne libre » vs Tontine Croissance/Solo, « crowdfunding » vs
  Invest) → pas de duplication : soit réutilisation/relabellisation de
  l'existant, soit fusion, à trancher au cas par cas et documenté ici.

## Livré — 1/7 : Messagerie Communauté (2026-09-04)

Premier des 7 écrans absents (« Ex: Chat dans la Communauté », cité par
l'utilisateur) :

- `lib/modules/community-data.ts` : `COMMUNITY_CONVERSATIONS` (4),
  `COMMUNITY_MESSAGES` (historique de démonstration), `AUTO_REPLIES`
  (réponse automatique aléatoire ~1,1 s après un envoi — simule une
  conversation vivante sans jamais prétendre qu'un vrai interlocuteur
  répond).
- `/community` : 3ᵉ onglet **Messagerie** (à côté de Groupes/Fil) — liste
  de conversations (badge non-lus), fil de discussion (bulles miennes/
  siennes), champ d'envoi. Bouton **« Appel vidéo »** dans l'en-tête du
  fil : ouvre un toast d'aperçu honnête (« arrivera avec le lancement »),
  **aucune tentative de connexion réelle** — WebRTC/signalisation n'est
  pas un chantier raisonnable pour une démonstration.
- Styles partagés ajoutés à `components/modules/module-page.module.css`
  (`.convoList`, `.msgBubble`, `.msgInputRow`, etc.) — réutilisables si
  une messagerie apparaît ailleurs plus tard.
- i18n FR+EN (`modulesPages.community.{tabGroups,tabFeed,tabMessages,
  messagesTitle,messagesSub,you,videoCall,videoCallPreview,
  messagePlaceholder,send}`).
- Aucune nouvelle table Prisma — 100 % état client, comme le reste des
  modules « Phase 8 ».

### Vérification
`tsc` + `lint` (0 warning) + `vitest` (**172**, inchangé) + `build` +
**E2E complet (40/40)** au vert. Vérifié visuellement (Playwright) :
liste de conversations, ouverture d'un fil, envoi + réponse automatique,
bouton appel vidéo.

## Livré — 5/7 : Certificat de fin de cours (Academy) (2026-09-04)

- Le clic « Continuer » d'un cours inscrit fait désormais **progresser
  une jauge réelle** (état client, +24 % par clic, plafonnée à 100 %) au
  lieu du toast placebo précédent — `PROGRESS_STEP` dans
  `academy-client.tsx`.
- À 100 %, la carte affiche un badge **« ✓ Terminé »** et un bouton
  **« Voir mon certificat »** (lien direct vers
  `GET /api/v1/academy/certificate?course=<id>`, cookie GET déjà géré par
  `withAuth`).
- `lib/modules/academy-certificate.ts::renderCertificatePdf()` — réutilise
  le moteur PDF maison (`MiniPdf`, déjà utilisé pour factures/reçus,
  ADR 0032) : nom du membre (issu du profil réel), titre/catégorie/
  niveau/durée/formateur du cours, date d'émission, et un **disclaimer
  explicite** rappelant qu'il s'agit d'un certificat de démonstration
  (progression simulée), pas encore une certification professionnelle
  reconnue. Rien n'est persisté côté serveur — la progression reste un
  état client, cohérent avec le reste du module.
- `academy-certificate.test.ts` (2 tests, relecture `pdf-lib`).

### Vérification
`tsc` + `lint` (0 warning) + `vitest` (**174**, +2) + `build` (route
`/api/v1/academy/certificate` compilée) + **E2E complet (40/40)** au
vert. Vérifié de bout en bout (Playwright) : inscription → 4 clics
« Continuer » → badge Terminé → téléchargement réel du PDF (200,
`content-type: application/pdf`, en-tête `%PDF-` valide).

## Livré — 2/7 : Objectif d'épargne (Wallet) (2026-09-04)

Décision de non-duplication (cf. règle de traitement) : un « objectif
d'épargne » est **le même mécanisme** qu'une tontine Achat en mode
**Solo** (séquestre bloqué jusqu'au dernier versement puis restitution
intégrale, ADR 0035) — aucune nouvelle table, aucun nouveau flux
d'argent. Seule la **présentation** change pour coller à la maquette :

- La tuile « 💎 Épargne », jusque-là un cul-de-sac (« bientôt
  disponible »), ouvre désormais un vrai panneau **« Vos objectifs
  d'épargne »** sur `/wallet` : liste des tontines Achat-Solo de
  l'utilisateur (`useTontines()`, filtre `type==='PURCHASE' &&
  purchaseMode==='SOLO'`), chacune avec nom/article visé, barre de
  progression (`totalContributed / targetAmount`), pourcentage, lien
  vers le détail de la tontine. Bouton **« + Nouvel objectif »** →
  `/tontine?type=purchase` (réutilise le formulaire de création
  existant, l'utilisateur choisit ensuite « Individuel »).
- Réutilise une classe CSS `.savingsBanner`/`.savingsIcon` qui existait
  déjà dans `wallet.module.css` sans jamais avoir été câblée — pas de
  nouveau fichier de style, seulement `.goalList`/`.goalItem`/`.goalBar`
  ajoutés pour la liste elle-même.
- i18n FR+EN (`wallet.savings{Title,Hint,Empty,Progress,Done,NewGoal}`).

### Vérification
`tsc` + `lint` (0 warning) + `vitest` (**174**, inchangé — aucune
nouvelle logique pure) + `build` + **E2E complet (40/40)** au vert.
Vérifié visuellement (Playwright, compte de démo avec plans solo réels
en base) : liste, barres de progression, lien de création.

## Livré — 3/7 : Code PIN de déverrouillage rapide (2026-09-04)

Décision de conception importante : le PIN **ne remplace pas**
l'authentification (mot de passe + 2FA §31), il **verrouille l'écran**
d'une session déjà authentifiée — même logique qu'un code de
déverrouillage de téléphone. Aucun jeton n'est jamais émis par le
contrôle du PIN.

- **Schéma** : `User.pinHash`/`pinEnabled` (`db push` fait).
- **API** : `GET/POST/DELETE /api/v1/auth/pin` (activer/changer/
  désactiver, bcrypt) + `POST /api/v1/auth/pin/verify` — **limité à 5
  tentatives/15min** (`enforceRateLimit`), un PIN à 4 chiffres n'a que
  10 000 combinaisons et ne doit jamais être brute-forçable.
- **Réglage** : nouvelle section dans `/profile/security` (même patron
  que la 2FA existante : idle/setup/disable), pas de nouvel écran dédié
  — le PIN est une option de sécurité parmi d'autres, pas une étape
  obligatoire d'inscription (qui reste inchangée, cf. « ne rien
  casser »).
- **Verrou** : `components/auth/PinLockGate.tsx`, monté dans le layout
  du tableau de bord à côté de `LegalGate`. Si un PIN est actif et
  qu'aucun déverrouillage n'a eu lieu pour **cet onglet/fenêtre**
  (`sessionStorage`, se réinitialise à chaque nouvelle ouverture —
  comme sur un téléphone), un panneau plein écran bloque tout accès
  jusqu'à saisie correcte ou déconnexion.
- `e2e/pin-lock.spec.ts` (nouveau, 1 test bout-en-bout : activer → 2ᵉ
  onglet verrouillé → mauvais code rejeté → bon code déverrouille →
  désactivation).

### Vérification
`tsc` + `lint` (0 warning) + `vitest` (**174**, inchangé) + `build` +
**E2E complet (41/41, +1)** au vert. Vérifié manuellement (Playwright,
2 pages du même contexte navigateur = mêmes jetons mais
`sessionStorage` distinct) : verrouillage confirmé même après tentative
de défilement (le panneau `position:fixed` couvre tout le viewport).

## Livré — 6/7 : Financement participatif (fusionné dans Invest) (2026-09-04)

Décision de non-duplication tranchée (question posée dans la section
« Livré 1/7 » d'origine) : le crowdfunding devient un **second onglet**
de `/invest` plutôt qu'un module séparé — pas de nouvelle entrée
`/explore`, pas de nouveau statut catalogue.

- `/invest` : chips **« Projets à financer » / « Financement
  participatif »** en haut de page. Le mode Investissement est
  inchangé ; le mode Financement participatif affiche des **campagnes
  communautaires** (`CROWDFUNDING_CAMPAIGNS`, 5 exemples, 4 catégories)
  avec sa propre bannière explicite : **don/soutien, jamais de
  rendement ni de contrepartie financière** — cadre volontairement
  différent de l'investissement, répété sur chaque carte (« Don
  communautaire — aucun rendement, aucune contrepartie financière »).
- Action par carte : « Soutenir ce projet » → toast confirmant qu'aucun
  montant n'est prélevé (état local, aucune écriture serveur, même
  patron que le reste d'ADR 0040/0041).
- `lib/modules/invest-insurance-data.ts` +`CROWDFUNDING_CATEGORIES`
  +`CROWDFUNDING_CAMPAIGNS`. i18n FR+EN (`modulesPages.invest.
  {modeInvest,modeCrowdfunding,campaignsTitle,crowdfundingBanner,
  raisedLabel,supportersLabel,noReturnNote,support,supported,
  toastSupport}`).

### Vérification
`tsc` + `lint` (0 warning) + `vitest` (**174**, inchangé) + `build` +
**E2E complet (40/40)** au vert. Vérifié visuellement (Playwright) :
bascule d'onglet, filtre par catégorie, action + toast.

## Livré — 7/7 : Prêts coopératifs (2026-09-04)

Dernier des 7 items — même traitement que KESSIA Invest/Insurance
(ADR 0040) : octroyer un crédit, **même sans intérêt**, est une
activité potentiellement réglementée. Nouveau module `loans`, statut
`REGULATED` (comme `invest`/`insurance`) — absent du cahier des
charges initial, ajouté explicitement sur demande à partir des
maquettes utilisateur (`ref` du catalogue le documente).

- `lib/modules/loans-data.ts` : `LOAN_CATEGORIES` (4 motifs : besoin
  urgent, développement d'activité, études, famille) +
  `LOAN_EXAMPLE_REQUESTS` (5 demandes d'exemple). **Cadrage solidarité
  sans intérêt** (pas un crédit à taux, cohérent avec la culture
  tontine/coopérative de KESSIA) — chaque carte porte quand même la
  mention explicite « exemple d'entraide entre membres — sans intérêt,
  sans engagement réel », en plus du bandeau de page.
- `/loans` : hero, catégories, grille filtrable de demandes d'exemple
  avec barre de progression, action « Soutenir cette demande » →
  toast (même patron que le financement participatif d'Invest). Ponts
  vers le Fonds de Garantie Solidaire et la Tontine Croissance (outils
  réels déjà existants, dans le même esprit d'entraide).
- `catalog.ts` : entrée `loans` ajoutée, `status: 'REGULATED'`,
  `href: '/loans'`. Automatiquement inclus dans `INTEREST_KEYS`
  (dérivé des modules non-LIVE) et sur `/explore` (lien « En savoir
  plus »). `middleware.ts` +`/loans` route protégée. i18n FR+EN
  complet (`modulesPages.loans.*` + `explore.modules.loans.*`).

### Vérification
`tsc` + `lint` (0 warning) + `vitest` (**174**, inchangé — `catalog.
test.ts` toujours vert, `loans` bien classé `REGULATED`/non-LIVE) +
`build` (route `/loans` compilée) + **E2E complet (41/41)** au vert.
Vérifié visuellement (Playwright) : catégories, filtre, action+toast,
et présence confirmée sur `/explore`.

## Suivi

6 des 7 items sont livrés : Code PIN · Objectif d'épargne (Wallet) ·
Messagerie + appel vidéo (aperçu) Communauté · Certificat Academy ·
Financement participatif (fusionné dans Invest) · Prêts coopératifs.
Reste : le **panier multi-articles Marketplace** (le plus gros
morceau, changement du modèle de commande) — section à suivre.
Reste également, hors de cet ADR : la **refonte visuelle** module par
module (4 phases définies, non commencée).
