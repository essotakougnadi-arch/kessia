# KESSIA — Carte des produits & personas (cahier des charges §4, §5)

_Mise à jour : 2026-09-01_

## Produits (§5)

| Produit | Cahier | État MVP |
|---|---|---|
| **KESSIA Web** | Portail Next.js 14 (App Router) | ✅ livré — c'est l'application principale du MVP |
| **KESSIA Admin** | Back-office `/admin/*` | ✅ livré (dashboard, users, KYC, tontines, transactions, support, Fonds de Garantie) |
| **KESSIA AI** | Assistant transversal | 🟡 mode règles + **réponses factuelles data-aware**, Smart Alerts, Business Advisor, **Opportunity Engine**, **Business Plan AI**, **voix** (dictée + lecture) ; LLM génératif = plus tard |
| **KESSIA Business Suite** | ERP léger PME | 🟡 module Business : produits, ventes, dépenses, **devis & factures (aperçu + PDF serveur + envoi e-mail)**, **CRM clients + fournisseurs + relances automatiques**, **trésorerie & objectifs** (calculés), **ADN de l'entreprise**, **plan d'affaires généré**. Fournisseur e-mail réel = clé à fournir |
| **Plan de croissance** | Feuille de route personnelle | ✅ `/growth` — objectif → action → échéance → indicateur, dérivé du Score, de l'ADN et des tontines (§23) |
| **Simulateurs** | Aide à la décision | ✅ `/simulator` — épargne, tontine, activité. Projections pures, aucun rendement promis (§20) |
| **Agenda** | Échéances réunies | ✅ `/calendar` — cotisations, factures, plan de croissance, relances clients (§26) |
| **Trust Center** | Transparence | ✅ `/trust` — grille tarifaire, plafonds KYC, données, sécurité, mentions réglementaires (§21) |
| **Anti-fraude** | Sécurité des opérations | ✅ moteur de règles (signaux d'appareil, vélocité, montants + **signaux comportementaux** : layering, structuration, nouveau bénéficiaire à montant élevé, accélération) + file de revue humaine **dédupliquée** `/admin/fraud` — aucun blocage automatique de fonds (§32) |
| **KESSIA « Mobile »** | App Android/iOS | 🟡 **PWA installable** (manifest + service worker prudent, repli hors-ligne) + **brouillons de formulaire hors-ligne** (transfert, vente, dépense, facture — `useFormDraft`, §35). Flutter natif = Phase 8 |
| **KESSIA API** | Plateforme partenaires | ⏭️ Phase 8 |

### Hub « Explorer » (`/explore`, §9–§16)
Recense tout l'écosystème : les modules **disponibles** (Wallet, Tontines,
Business, KESSIA AI, KESSIA Score, Plan de croissance, Simulateurs, Agenda,
Transparence) en accès direct, et les 7 modules de la
**feuille de route** (Market, Academy, Communauté, Jobs, Invest, Insurance,
Diaspora) présentés honnêtement — non construits, Phase 8 — avec un bouton
« M'intéresser » qui alimente la priorisation (`/admin/modules`). Invest et
Insurance affichent une réserve réglementaire permanente ; KESSIA n'est pas
assureur et ne promet aucun rendement.

### PWA — comportement du service worker (`public/sw.js`, `kessia-v2`)
- `/api/**` : **jamais** mis en cache, jamais de repli — le client gère l'échec
  (bandeau hors ligne + `ErrorNote`) et SWR re-valide au retour du réseau.
- Navigations : réseau d'abord (**timeout 3,5 s**) → coquille de la même route en
  cache → `/offline`. Les navigations réussies sont mises en cache (plafonné à
  16 entrées). 6 coquilles pré-cachées à l'installation (`/home`, `/wallet`,
  `/tontine`, `/business`, `/profile`, `/login`).
- Assets statiques (`/_next/static`, `/logo`, polices, images) : cache d'abord.
- Enregistré **en production seulement**. Un échec est silencieux.
- **Aucune donnée financière en cache** — seules les coquilles (layout + îlots
  clients + squelettes) le sont.

### Connectivité (`hooks/useOnline.ts`, `components/ui/OfflineBanner.tsx`, §51)
- Bandeau fixe discret dès que le navigateur perd le réseau (monté dans le layout
  du tableau de bord et le back-office). `ErrorNote` affiche alors « Vous êtes
  hors ligne » plutôt qu'une erreur générique.
- `/offline` : « Réessayer » réel (rechargement) + rechargement automatique au
  retour du réseau.

### Brouillons de formulaire (`hooks/useFormDraft.ts`, §35)
- Sauvegarde locale (`localStorage`, préfixe `kessia:draft:`) d'une saisie en
  cours : transfert wallet, vente, dépense, facture.
- Restaurée au montage avec un bandeau discret (`DraftNotice`) ; effacée à la
  soumission réussie ; « Repartir de zéro » disponible.
- Jamais utilisée pour les formulaires courts (connexion, OTP) ni sensibles
  (mot de passe, pièces KYC).

### Compte séquestre par tontine (`lib/tontine/escrow.ts`, §6.5)
- Chaque tontine active possède un wallet dédié `TONTINE_ESCROW` (jamais rattaché
  à un utilisateur) qui **détient réellement** les cotisations d'un cycle entre
  l'encaissement et le versement au bénéficiaire. Fini la cagnotte « nulle part ».
- Cotisation = **débit du membre → crédit du séquestre** ; versement = **débit du
  séquestre → crédit du bénéficiaire**. Les deux jambes sont posées atomiquement
  (`postDoubleEntry`), avec verrou de ligne (`SELECT … FOR UPDATE`) et garde de
  solde : **jamais de versement pour un montant supérieur à ce qui est détenu**.
- Invariant vérifiable : `solde(séquestre) == Σ cotisations réglées − Σ montants
  déjà versés`. `reconcileTontineEscrow` l'expose ; le back-office `/admin/tontines`
  affiche le solde réel + un badge « écart » si le rapprochement échoue, et
  `/admin/analytics` distingue « détenu en séquestre (réel) » de « cagnottes en
  jeu (estimé) ».
- Le membre voit, sur le détail de sa tontine, « 🔒 X FCFA en séquestre pour le
  groupe ».

### Tontine Achat : groupée ou individuelle (`lib/tontine/type-meta.ts`, §6.4)
- **Groupée** (défaut) : cagnotte tournante — chacun son tour reçoit la cagnotte
  pour son achat.
- **Individuelle** (`PurchaseMode.SOLO`) : une personne épargne **seule, pour son
  propre article**. Elle saisit l'article + son prix et le nombre de versements ;
  KESSIA calcule chaque échéance. Les versements sont **détenus sur le compte
  séquestre jusqu'au dernier**, puis recrédités en totalité sur son wallet pour
  acheter. Un seul membre, aucun code d'invitation, démarrage immédiat.
- Le mode `solo` réutilise le compte séquestre (§6.5) : mêmes garanties
  (double écriture atomique, verrou de ligne, « jamais plus que détenu »,
  idempotence, réconciliation). `resolveDistribution(type, purchaseMode)` est la
  fonction unique qui tranche entre `rotating` et `solo` pour la tontine Achat.

### Couleur d'accent au choix (`store/accentStore.ts`, §36)
- Deux teintes signature : **Terracotta** `#B65A3A` (défaut) et **Brique**
  `#C84B1E` (la teinte d'origine). Choix dans le profil (« Couleur d'accent »),
  appliqué via `data-accent` sur `<html>` avec script anti-flash, persisté par
  navigateur. Le chrome de marque (thème-color, manifest, landing mono-thème)
  reste sur la teinte signature.

### Documents juridiques versionnés (`lib/legal/versions.ts`, §8)
- `LEGAL_VERSION` (format `AAAA-MM-JJ`) = source unique. À chaque révision d'un
  document, on l'incrémente à un seul endroit.
- L'acceptation est horodatée à l'inscription (`User.termsAcceptedVersion` /
  `termsAcceptedAt`).
- **Mur de ré-acceptation** : `components/legal/LegalGate.tsx` (monté dans le
  layout du tableau de bord) affiche un panneau bloquant tant que la version
  acceptée ≠ `LEGAL_VERSION` ; `POST /api/v1/legal/acceptance` enregistre la
  nouvelle acceptation (audit `legal.terms_accepted`).

### Internationalisation (`lib/i18n/`, §38)
- `useT()` + catalogues `fr` (source de vérité) / `en` / `ee`, fallback
  automatique vers le français, interpolation `{var}`, formatage `Intl`
  piloté par la locale.
- **Traduit FR / EN — tout l'espace membre** : landing, parcours
  d'authentification, navigation, accueil, wallet, tontines (liste, détail,
  4 types), profil et ses 5 écrans secondaires (KYC, Score, Sécurité,
  Notifications, Confidentialité), support, Business (liste + détail à 11
  onglets + formulaires), Explorer, Trust Center, plan de croissance,
  simulateurs et l'assistant KESSIA AI. Sélecteur de langue disponible hors
  connexion (`LanguageSwitcher`). Les métadonnées des types de tontines, le
  catalogue de modules et les profils utilisateur sont localisés côté client
  par des hooks dédiés (`useTontineTypeMeta()`, `useModuleCatalog()`,
  `useUserTypeMeta()`), les sources restant en FR pour l'usage serveur.
- **Libellés des utilitaires** (`lib/utils/format.ts`) : dates relatives
  (« il y a 5 min »), types de transaction et fréquences de tontine sont
  localisés — le provider pousse la traduction courante à ces fonctions pures
  via `setFormatMessages()`.
- **Back-office `/admin/*`** : les ~17 écrans staff (dashboard, utilisateurs,
  revue KYC, transactions, tontines, support, Fonds de Garantie, anti-fraude,
  modules, analytics) sont traduits FR / EN (bloc `admin.*`, ~230 clés). La
  sidebar est un composant client (`app/admin/sidebar.tsx`), les helpers de
  pastilles (`pills.tsx`) prennent le traducteur en paramètre.
- **Prose générée côté serveur** : le KESSIA Score, l'ADN d'entreprise, le plan
  de croissance, les opportunités, les Smart Alerts, la grille tarifaire, les
  notes de trésorerie, les mentions du Trust Center, les « priorités du jour »
  admin et les titres d'événements de l'agenda (cotisation / facture / relance)
  sont traduits — `lib/i18n/server.ts` lit la locale dans un cookie et fournit un
  traducteur (+ `serverNumber()` pour les montants) aux générateurs.
- **Éwé** : navigation + actions de base uniquement, le reste retombe en
  français — le vocabulaire financier / juridique attend une relecture native
  (`LOCALE_META.ee.ready = false`).
- **§38 = 🟢** — audit ADR 0034 : le détail d'une tontine et l'agenda, derniers
  écrans à contenir des chaînes FR en dur, sont passés par `useT()` / `serverT()`.
  Reste hors périmètre : la relecture native de l'éwé et les pages `/legal/*` (à
  traduire après validation juridique du texte FR).

## Documentation

| Fichier | Pour qui | Contenu |
|---|---|---|
| `docs/support/playbook.md` | agents support (`SUPPORT` / `ADMIN`) | principes, cycle de vie du ticket, réponse par catégorie, matrice d'escalade, réponses types, interdits |
| `docs/user/getting-started.md` | utilisateurs | prise en main : compte, KYC, wallet, tontines, business, assistant, croissance, confiance & confidentialité |

## Personas & profils (§4)

Le `userType` est déclaratif (choisi à l'inscription, modifiable dans le
profil). Il oriente l'accueil et les conseils de l'IA ; il ne change **aucune
permission**. Le rôle RBAC, lui, évolue automatiquement avec l'usage.

### Profils proposés dans le MVP

Concrètement (`lib/user/user-type.ts`) : chaque profil définit `focus` (les
services remontés en tête de la grille d'accueil), `firstSteps` (la carte
« Premiers pas · <profil> ») et `aiPrompts` (les suggestions de KESSIA AI).

| Profil (`userType`) | Besoin principal | Services mis en avant | Premiers pas |
|---|---|---|---|
| **Particulier** | Épargner, cotiser, transférer | Wallet, Tontines | Vérifier l'identité → recharger le wallet → rejoindre une tontine |
| **Entrepreneur débutant** | Se lancer | Tontines, Business | Vérifier l'identité → créer une tontine Projet → déclarer l'activité |
| **Micro-entreprise** | Suivre l'activité au quotidien | Business, Wallet | Ajouter le catalogue → enregistrer une vente → suivre la trésorerie |
| **PME** | Piloter | Business, Wallet, Tontines | Créer une facture → ajouter les clients → consulter l'ADN |
| **Coopérative / Groupe** | Animer un collectif | Tontines, Wallet | Créer une tontine de groupe → consulter le contrat → découvrir le Fonds de Garantie |

### Rôle RBAC (`UserRole`) — évolution automatique

| Déclencheur | Effet |
|---|---|
| Création d'une tontine | `USER → TONTINE_MANAGER` |
| Création d'une entreprise | `USER` / `TONTINE_MANAGER → BUSINESS_OWNER` |

Ces rôles portent l'identité et adaptent les tableaux de bord ; ils ne donnent
**aucun** accès au back-office. Les rôles privilégiés
(`ADMIN`, `COMPLIANCE`, `FINANCE`, `SUPPORT`, …) sont attribués manuellement.

### Personas non outillés (Phase 8)

Mentor, Formateur, Fournisseur, Institution, Partenaire financier, Assureur
partenaire — modélisés (`UserType`) mais leurs parcours dépendent de modules
Phase 8 (Community, Academy, Market, Insurance, Partenaires / Open API).

## Comptes de démonstration

Voir `prisma/seed.ts` — 12 comptes togolais (Lomé, Kara, Kpalimé, Sokodé,
Aného, Atakpamé), 4 entreprises complètes (produits, ventes, dépenses,
**clients typés + relances, fournisseurs, objectifs, devis `DEV-…` + factures**),
7 tontines couvrant les 4 types (dont un plan d'achat individuel) et tous les états, Fonds de Garantie en mode
démonstration avec 3 demandes, des manifestations d'intérêt pour les modules
à venir, des brouillons de plan d'affaires et des étapes de plan de croissance
en cours. Mot de passe commun : `Kessia2026!`.
