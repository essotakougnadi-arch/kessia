# Changelog — KESSIA App

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/).
Le projet suit la feuille de route par phases du cahier des charges (§52).

## [Non publié]

### Ajouté
- **Auth** : inscription (téléphone → OTP → profil → KYC), connexion mot de passe / OTP, refresh token rotatif, garde middleware, store Zustand persistant + cookie pour le middleware.
- **Client API centralisé** (`lib/api/client.ts`) : header Bearer, refresh automatique sur 401 (dédupliqué), déconnexion + redirection si échec.
- **Wallet** : solde, stats 30 j, historique filtrable, modales dépôt / transfert (ledger transactionnel + idempotent).
- **Tontine** : liste, création, détail (membres, progression, cotisation avec confirmation), code d'invitation.
- **KESSIA AI** : chat FAQ / onboarding (mode règles serveur), suggestions, pré-remplissage `?q=`.
- **Support** : liste de tickets, création, fil de discussion + réponse.
- **Business** : liste + création d'activité (sous-modules produits/ventes/factures à venir — Phase 4).
- **Notifications** : centre, filtres, marquer lu.
- **Profil** : identité, KESSIA Score, bannière KYC, déconnexion — endpoint `GET/PATCH /api/v1/profile`.
- **KYC fonctionnel** : `/profile/kyc` branché sur `/api/v1/kyc` — statuts (§30), envoi de pièces (compression client, stockage data-URI en MVP), motifs de rejet, aide IA.
- **Admin** : `GET /api/v1/admin/overview` (RBAC) + dashboard sur données réelles + état « accès réservé ».
- **Journal d'audit** (`lib/audit`) — actions critiques tracées dans `audit_logs` (§31, §51). ADR 0004.
- **Rate limiting** (`lib/security/rate-limit`) — auth, wallet, kyc, ai, payments (compteur mémoire en MVP → Upstash en prod).
- **Wallet — Recevoir** : numéro + QR code (`qrcode`) + partage (§6.1). **Retirer** via l'abstraction paiements.
- **Dashboard — section « À faire »** : KYC non vérifié, cotisations dues sous 7 j (§7). Actions rapides alignées §7 (Envoyer / Recevoir / Recharger / Tontine).
- **Abstraction `PaymentProvider`** (§6.3, ADR 0005) : interface + 4 fournisseurs (Mobile Money / Banque / Cash / QR, simulés & marqués `simulated`), `PaymentTransaction`, `POST/GET /api/v1/payments`, `GET /api/v1/payments/[id]`.
- **Business complet** (§7, §11-12) : `/business/[id]` avec onglets Résumé (KPIs CA/marge/stock/top produits) · Produits · Ventes · Dépenses · Factures (TVA, numérotation `FAC-YYYY-####`). Nouveau `POST/GET /api/v1/business/[id]/invoices`.
- **Back-office admin** (§45) : garde RBAC (`AdminGuard` + `withAuthAndRole`), écrans `/admin/{dashboard,users,kyc,kyc/[id],transactions,tontines,support}`, APIs correspondantes. **Revue KYC** : valider / rejeter (motif obligatoire, §30) / demander une action → notifie l'utilisateur + audit.
- **Tests** (§49) : `vitest`, 31 tests unitaires (format, crypto, validations, rate-limit, providers). **CI** (§50) : `.github/workflows/ci.yml` (install → prisma generate → lint → typecheck → tests → build). `.eslintrc.json`, scripts `typecheck` / `test`.
- **i18n** (§38) : `lib/i18n` (locales fr/en/ee, fallback FR, `I18nProvider` + `useT()`), formatage `Intl` piloté par la locale, sélecteur Langue & Région dans le profil.
- **Dark mode** (§36, DS §24) : palette sombre complète (3 états système/clair/sombre), `store/themeStore`, script anti-flash, sélecteur Apparence dans le profil.

### Route
- Le back-office passe de `/(admin)` (collision `/support`) à **`/admin/*`**.

## [Non publié] — Durcissement (Sécurité · Conformité · Fiabilité · Simplicité)

### Sécurité (§31)
- **MFA / 2FA (TOTP)** : `lib/auth/twofactor.ts` (`otplib`), routes `POST/DELETE /api/v1/auth/2fa` (setup/enable/disable) + `POST /api/v1/auth/2fa/verify` (défi de connexion) + **8 codes de secours** hashés. Login & verify-otp renvoient `{ requires2fa, challengeToken }` si activée. UI : étape 2FA sur login/verify-otp + section dédiée sur `/profile/security`.
- **`/profile/security`** : changement de mot de passe (révoque toutes les sessions + notifie), gestion 2FA, **liste + révocation des sessions actives** (`GET/DELETE /api/v1/auth/sessions`).
- **Middleware durci** : `middleware.ts` vérifie désormais la **validité du JWT** (`jose`, edge) et le **rôle** pour `/admin/*` (redirection si insuffisant). Nettoie le cookie mort.
- **Logs structurés** : `lib/logger.ts` (`winston`), `logApiError()` câblé dans 40 routes API (§47).
- **`GET /api/health`** : sonde de disponibilité (base incluse).
- Schéma : `User.twoFactorEnabled/Secret/Backup`, `dataExportRequestedAt`, `deletionRequestedAt`.
- **ADR 0006** — MFA, middleware RBAC edge & droits RGPD.

### Conformité (§4.5, §59)
- **Matrice de conformité** (`docs/compliance/matrix.md`) : 10 domaines (structure juridique, protection des données, KYC/LAB-FT, paiements, investissement, assurance, fiscalité, contrats, conservation, sécurité), statut par ligne, synthèse des bloquants avant pilote — support à valider par conseil juridique.
- **Droits RGPD** (`/profile/privacy`, `GET/POST /api/v1/profile/privacy`) : visualisation des consentements, **export JSON** des données personnelles (droit d'accès / portabilité — pièces KYC exclues), **demande de suppression de compte** + annulation. L'effacement effectif reste une procédure manuelle encadrée (obligations de conservation AML / comptables).
- **`GET/PATCH /api/v1/me`** : alias de `/api/v1/profile` (§46).

### Fiabilité (§6.3, §10, §12, §44) — ADR 0007
- **Webhooks de règlement** : `POST /api/v1/payments/webhooks/[provider]` — signature HMAC-SHA256 (`x-kessia-signature` / `PAYMENT_WEBHOOK_SECRET`), **idempotent** (`settlePendingPayment`), `payment.completed` → écriture ledger (clé `PAYTX_<id>`) + `PaymentTransaction=COMPLETED` + notification ; `payment.failed` → `FAILED` + notification.
- **Reversal de transfert** : si le crédit du destinataire échoue, écriture `REVERSAL` (clé `REV-<referenceId>`) qui rétablit le solde de l'expéditeur ; résultat tracé dans l'audit.
- **`Idempotency-Key`** accepté sur `wallet/transfer` (dérive les deux écritures) et `tontine/[id]/contribute`.
- **KESSIA Score** (`lib/score/`, `GET /api/v1/score`, écran `/profile/score`) : moteur **à base de règles, déterministe et explicable** — 7 facteurs (KYC, ancienneté, activité wallet, fiabilité + participation tontine, Business, 2FA) + malus (wallet verrouillé, sanctions), score `[0,1000]`, bandes, conseils priorisés. Persisté dans `UserProfile.kessiaScore`. **N'est pas un score de crédit réglementé.**
- **Tontine — rejoindre par code** : `POST /api/v1/tontine/join {code}` + modale dédiée sur `/tontine`.
- **Notifications automatiques** (`lib/notifications/notify`) : nouveau membre / cotisation reçue → gestionnaire de tontine ; transfert reçu → destinataire ; paiement confirmé/échoué → utilisateur.
- **Fonds de Garantie Solidaire** : structure et modèle cible documentés, **non activé** (qualification juridique requise — ADR 0007 §5).

### Simplicité (§5, §7, §33, §45, MVP §4) — ADR 0008
- **Back-office — actions en écriture** : `PATCH /api/v1/admin/support/[id]` (affecter, changer de statut, répondre au client, note interne) avec notification du demandeur ; `PATCH /api/v1/admin/users/[id]` (suspendre / réactiver — coupe la connexion + révoque les sessions). Écran `/admin/support/[id]` (fil complet) ; modération depuis `/admin/users`.
- **Smart Alerts** : `lib/insights/`, `GET /api/v1/ai/insights` — recommandations **dérivées des données réelles** (KYC, échéances de cotisation, solde bas, 2FA, activité Business, KESSIA Score). Section « Pour vous » sur l'accueil + en tête de KESSIA AI.
- **Correction MASTER #3** : la bannière KESSIA Score de l'accueil (« 820 ») et le pied de la landing (« des milliers d'entrepreneurs ») affichaient des valeurs inventées → branchés sur des données réelles / reformulés.
- **Préférences de notification** (`/profile/notifications`) : 6 catégories désactivables (SECURITY toujours actif). `notify()` les respecte. Champs `UserProfile.notify*`.
- **Onboarding** (`/onboarding`) : carrousel de bienvenue 4 écrans, « Passer », complétion mémorisée ; les CTA de la landing y passent.
- **Confidentialité des notes internes** : `GET /api/v1/support/[id]/messages` masque désormais `isInternal` au demandeur.
- **ADR 0008**.
- **PWA** : `manifest.webmanifest`, `icon`, `apple-icon`.
- **Composants** : Modal, Toaster, ErrorNote.
- **Seed** de développement (`prisma/seed.ts`).
- **Docs** : README, CHANGELOG, `docs/`.

### Modifié (conformité cahier des charges)
- **Couleur signature** → `#B65A3A` (KESSIA Terracotta, §36) — remplaçait `#C84B1E`.
- **Navigation mobile** → `Accueil | Wallet | Tontines | Business | Profil` (§37) ; KESSIA AI en bouton flottant.
- **`KycStatus`** → `NOT_STARTED / IN_PROGRESS / UNDER_REVIEW / ACTION_REQUIRED / VERIFIED / REJECTED / EXPIRED` (§30).
- **`UserRole`** → ajout `BUSINESS_OWNER`, `TONTINE_MANAGER` (§45).
- Suppression des métriques d'usage inventées sur la landing (MASTER règle #3).

### Corrigé
- **Inscription cassée** : le front n'envoyait pas `consentTerms` / `consentData` requis par le schéma → 400 systématique.
- **Connexion base de données** : bascule sur le pooler Supabase (hôte direct IPv4 déprécié).
- Encodage UTF-8 réparé sur 16 fichiers (mojibake introduit par un script de remplacement).

## [Non publié] — Orchestration tontine, 4 types & tests E2E (ADR 0009)

### Ajouté
- **Les 4 types de tontines** (§6.4) désormais visibles et sélectionnables : **Classique Tournante**, **Projet**, **Croissance**, **Achat** (`lib/tontine/type-meta.ts`). Onglet Tontines : bandeau de résumé (nombre / cotisé / prochaine échéance), badge de type sur chaque carte, section « Les 4 types » avec fiche détaillée (description + étapes) et raccourci de création. Formulaire de création : sélecteur de type en tête. Détail : bloc « Comment fonctionne ce type ».
- **Distribution selon le type** dans l'orchestrateur : *Classique / Achat* → cagnotte tournante (1 tour/membre) ; *Projet* → collecte unique versée à l'organisateur (`totalRounds = 1`) ; *Croissance* → épargne bloquée pendant N tours puis **restitution de la mise à chaque membre** en fin de cycle. `totalRoundsForType()`.
- **Cycle de tontine automatique** (`lib/tontine/`) : démarrage auto quand le groupe est complet (ou `PATCH /api/v1/tontine/[id] {action:'start'}` par le créateur) → calendrier `TontineSchedule`, cotisations `PENDING` du tour ; à chaque cotisation, si le tour est complet → **versement au(x) bénéficiaire(s)** (`TONTINE_PAYOUT`, idempotent) + passage au tour suivant ou clôture, avec notifications.
- **`POST /api/v1/cron/tontine-tick`** (secret `x-cron-secret`) : cotisations en retard (`LATE`), relances anti-spam, rattrapage des tours non versés. À brancher sur un ordonnanceur.
- Bouton **« Démarrer la tontine »** sur le détail (créateur, ≥ 2 membres).
- **Tests E2E** (`@playwright/test`, dossier `e2e/`, viewport mobile) : 22 tests — auth/RBAC, onboarding, navigation, wallet (dépôt/transfert), tontine (4 types visibles, création par type, code, **cycle complet démarrage→versement**), admin (ticket). Workflow `.github/workflows/e2e.yml` (Postgres jetable). Scripts `test:e2e` / `test:e2e:ui`.
- `E2E_RATE_LIMIT_BYPASS` : neutralise le rate limiting pour la suite E2E (opt-in explicite, `console.warn` de sécurité au démarrage, jamais en prod).

### Connu / à faire
Voir `docs/progress/status.md`.

## [Non publié] — Profils, contrat de tontine & Fonds de Garantie (ADR 0010)

### Ajouté
- **Profils utilisateur (§4)** : `userType` déclaratif (5 profils dans le MVP — Particulier, Entrepreneur débutant, Micro-entreprise, PME, Coopérative), collecté à l'inscription et modifiable dans le profil. **Élévation de rôle automatique** : `USER → TONTINE_MANAGER` (1ʳᵉ tontine), `→ BUSINESS_OWNER` (1ʳᵉ entreprise). `docs/product/overview.md`.
- **Contrat numérique de tontine (§6.4, « Smart Agreement »)** : snapshot immuable des termes figé au démarrage (objet, finances, calendrier des bénéficiaires, règles), acceptation horodatée par chaque membre. Nouveau modèle **`TontineEvent`** (journal : création, adhésion, activation, cotisation, retard, versement, tour, clôture) qui comble aussi le §42. `GET/POST /api/v1/tontine/[id]/agreement`, écran `/tontine/[id]/contrat`.
- **Fonds de Garantie Solidaire (§6.5) — MODE DÉMONSTRATION** : règles, projection du solde (1 % des cotisations − demandes réglées), demandes membres, **validation humaine par la conformité**, journal d'événements, reporting. Aucun mouvement de fonds réel ; bandeau « démonstration » permanent ; formulaire de demande derrière `GUARANTEE_FUND_USER_REQUESTS`. Écrans `/tontine/garantie` et `/admin/guarantee`. Modèles `GuaranteeClaim` + `GuaranteeEvent`.
- **PWA (§5)** : service worker prudent (`public/sw.js` — `/api/**` jamais en cache, navigations réseau-d'abord + repli `/offline`), enregistrement en production, page `/offline`. KESSIA devient installable comme une application.
- **Seed enrichi** : 12 comptes togolais, 4 entreprises complètes (produits, ventes, clients, factures, dépenses), 6 tontines (4 types, états PENDING/ACTIVE/COMPLETED, avec contrats et journaux), 3 demandes au Fonds de Garantie.
- **ADR 0010** ; tests unitaires du contrat (`agreement.test.ts`).

## [Non publié] — Parcours par profil, CRM business, ADN, hub Explorer (ADR 0011)

### Ajouté
- **Parcours adapté au profil (§4)** : chaque `userType` porte des modules mis en avant, des « premiers pas » et des questions suggérées. L'accueil réordonne la grille de services et affiche une carte « Premiers pas · <profil> » ; KESSIA AI propose des suggestions par profil.
- **CRM business (§7)** : **clients** segmentés (`PROSPECT`/`NOUVEAU`/`REGULIER`/`FIDELE`/`INACTIF`, dérivé du comportement d'achat) avec fiche, notes, relances datées et historique ; **fournisseurs** (répertoire + achats, rattachables aux dépenses) ; **devis → facture** (`kind` `QUOTE`/`INVOICE`, numérotation `DEV-`/`FAC-AAAA-####`, conversion transactionnelle) ; **trésorerie** et **objectifs** en vues calculées (jamais stockées) ; **export CSV**. Nouveaux modèles `Supplier`, `BusinessGoal` ; `Customer`/`Expense`/`Invoice` étendus. Onglets Clients / Fournisseurs / Devis & Factures / Objectifs / Trésorerie / ADN sur `/business/[id]`.
- **ADN de l'entreprise (§8)** : `computeBusinessDNA()` — profil agrégé (activité 30/90 j, marge brute, mix catégories, produits phares, clients récurrents), **score de santé 0–100** à base de règles + recommandations déduites. `GET /api/v1/business/[id]/dna`, onglet dédié. Rien n'est inventé.
- **Hub « Explorer » (§9–§16)** : `/explore` — modules disponibles (5) en accès direct, modules de la feuille de route (7) présentés honnêtement avec bouton « M'intéresser » et note réglementaire permanente (Invest/Insurance après validation, KESSIA n'est pas assureur). Modèle `ModuleInterest`, `/api/v1/modules/interest`, `/admin/modules` (+ `/api/v1/admin/modules`) pour la priorisation. Liens morts de l'accueil et de la sidebar supprimés → `/explore`.
- **Seed** : fournisseurs, objectifs, types de clients + relances, devis (`DEV-…`), et manifestations d'intérêt pour les modules à venir.
- **ADR 0011** ; tests `crm.test.ts`, `csv.test.ts` ; E2E `explore-crm.spec.ts` (24 tests au total).

## [Non publié] — Plan de croissance, simulateurs, Opportunity Engine, plan d'affaires (ADR 0012)

### Ajouté
- **Simulateurs (§20)** : `/simulator` — épargne/objectif, tontine, activité. Calculs **purs et déterministes** (`lib/simulator/*`), **aucun rendement** simulé (le capital projeté = initial + versé). Sliders, mini-graphes, bannière « projections, pas des promesses ».
- **Plan de croissance (§23)** : `/growth` — objectif → action → échéance → indicateur → progression. `lib/growth/rules.ts` (pur, testé) génère les étapes à partir du KESSIA Score, de l'ADN des activités, des tontines et du KYC ; `GrowthStepState` persiste la progression (`GET /api/v1/growth`, `PATCH /api/v1/growth/steps/[key]`). Anneau de progression, actions Fait / En cours / Ignorer.
- **Opportunity Engine (§17)** : `GET /api/v1/opportunities` — opportunités concrètes tirées des données propres de l'utilisateur (devis à relancer avec montant, clients dormants, réassort rentable, tontine publique adaptée, palier de Score). Surfacées sur l'accueil et dans KESSIA AI.
- **Business Plan AI (§17)** : modèle `BusinessPlan` (un par entreprise) ; `generateBusinessPlanDraft()` produit un brouillon structuré depuis l'ADN ; onglet « Plan » sur `/business/[id]` (éditable, régénérable, export texte). `GET/PUT/POST /api/v1/business/[id]/plan`.
- **KESSIA AI contextuel (§17)** : `lib/ai/data-answers.ts` répond aux questions factuelles avec les données réelles (solde, prochaine cotisation, Score, ventes du mois, plan, opportunités) avant la base de connaissances (enrichie : croissance, simulateurs, CRM, ADN, Explorer). **Voix** (`hooks/useVoice.ts`, Web Speech API) : dictée + lecture des réponses, feature-détectées (avance aussi §34).
- **§4** : `firstSteps`/`aiPrompts` par profil pointent vers simulateur et plan ; accueil gagne les sections « Plan de croissance » et « Opportunités » ; `growth` et `simulator` ajoutés aux modules LIVE d'`/explore`.
- **Seed** : `GrowthStepState` de démonstration, brouillons `BusinessPlan` pour les 4 entreprises.
- **ADR 0012** ; tests `simulator.test.ts` (12), `growth/rules.test.ts` (5) → 72 unitaires ; E2E `growth-simulator.spec.ts` → 26 au total.

## [Non publié] — Anti-fraude, Trust Center, plafonds KYC, agenda, analytics, canaux, voix, ops (ADR 0013)

### Ajouté
- **Anti-fraude (§32)** : moteur de règles (`lib/fraud/*`) — nouvel appareil, vélocité, fan-out, montant anormal, quasi-vidage, compte dormant, burst d'échecs. Modèles `Device`, `FraudAlert`. Câblé sur login / transfert / retrait (non bloquant). File de revue humaine `/admin/fraud` (`GET`/`PATCH /api/v1/admin/fraud[/id]`, rôles conformité). **Aucun blocage automatique de fonds.**
- **Plafonds KYC (§30)** : `lib/kyc/limits.ts` — plafonds par opération et mensuels sortants selon le palier (0/1/2), appliqués **côté serveur** (`wallet/transfer`, `payments`). Stub de screening sanctions/PPE (`lib/kyc/screening.ts`, drapeau pour revue humaine).
- **Trust Center (§21)** : `/trust` + `GET /api/v1/trust` — grille tarifaire (`lib/fees.ts`), plafonds + consommation du mois, sécurité, données, Fonds de Garantie, mentions réglementaires. Entrée menu Profil.
- **Agenda (§26)** : `/calendar` + `GET /api/v1/calendar` — cotisations, factures, échéances du plan de croissance, relances clients, réunies et groupées par jour.
- **Data & Analytics (§28) + Admin Copilot (§17)** : `/admin/analytics` + `GET /api/v1/admin/analytics` — KPI agrégés (sans nominatif) + série 30 j + « priorités du jour » (aussi sur `/admin/dashboard`).
- **Canaux de notification (§33)** : `lib/notifications/channels.ts` — abstraction multi-canal ; `IN_APP` réel, `PUSH`/`SMS`/`EMAIL` en simulation ; journal `NotificationDelivery` ; distribution selon la priorité.
- **Voix — navigation (§34)** : `lib/voice/commands.ts` — commandes vocales de navigation intégrées à la dictée de KESSIA AI.
- **Observabilité (§47)** : `GET /api/metrics` (format Prometheus, protégé par `METRICS_TOKEN`).
- **Exploitation (§41, §48, §50, §31)** : `docs/{database/schema,security/overview,operations/backup-recovery}.md` ; `scripts/db-backup.mjs` (`npm run db:backup`), `scripts/smoke.mjs` (`npm run smoke`) ; `.github/workflows/staging.yml` (squelette).
- **Seed** : appareils + alertes anti-fraude de démonstration ; solde de Yao ajusté pour illustrer le plafond KYC.
- **ADR 0013** ; tests `fraud/rules.test.ts` (6), `kyc/limits.test.ts` (4), `voice/commands.test.ts` (5) → 87 unitaires ; E2E `trust-fraud-calendar.spec.ts` → 30 au total.

## [Non publié] — Infra : stockage KYC, rate limiting distribué, ordonnanceur (ADR 0014)

### Ajouté / modifié
- **Stockage KYC hors base (§30)** : `lib/storage/{supabase-storage,kyc-storage}.ts` — Supabase Storage (bucket privé, REST, URL signées 5 min). `KycDocument` += `storageKey`, `mimeType` ; `fileUrl` devient un repli data-URI. `POST /api/v1/kyc/documents` téléverse dans le bucket si configuré ; `GET /api/v1/admin/kyc/[id]` renvoie une URL signée courte. Nettoyage best-effort du bucket au remplacement / retrait d'une pièce.
- **Rate limiting distribué (§31)** : `enforceRateLimit()` passe en **asynchrone** (15 routes) ; `checkRateLimit()` utilise **Upstash Redis** (sliding window, compteur partagé) si `UPSTASH_REDIS_REST_URL`/`TOKEN` sont définis, sinon compteur mémoire. Repli mémoire sur toute erreur Upstash.
- **Ordonnanceur du tick tontine (§12, §33)** : `cron/tontine-tick` accepte `GET` (Vercel Cron) **et** `POST` (GitHub Actions / curl). `.github/workflows/cron.yml` (planifié `7 * * * *`, ignoré sans secrets) + `kessia-app/vercel.json`.
- **ADR 0014** ; tests `storage/kyc-storage.test.ts` (5), `rate-limit` (+1 async) → 93 unitaires ; 30 E2E inchangés.

## [Non publié] — Pages légales (projet), documents imprimables, relances auto (ADR 0015)

### Ajouté
- **Pages légales (§59, bloquant pilote #5)** : `/legal/terms` (CGU), `/legal/privacy` (Politique de confidentialité), `/legal/mentions` (Mentions légales) — pages **publiques**, brouillons rédigés à partir des faits du produit (modèle de données, rétention, sous-traitants, tarifs, droits RGPD), bandeau « projet — à valider juridiquement » permanent. Pied de page de la landing recâblé.
- **Documents imprimables (§7, §6.1)** : `GET /api/v1/business/[id]/invoices/[invoiceId]` et `GET /api/v1/wallet/transactions/[id]` ; pages `/documents/invoice/…` (devis / facture A4) et `/documents/receipt/…` (reçu wallet), layout sans chrome, `@media print`, bouton « Imprimer / PDF » → `window.print()` (aucune dépendance). Liens depuis l'onglet Devis & Factures et depuis chaque ligne du wallet.
- **Relances clients automatiques (§7, §33)** : `Customer` += `followUpNotifiedAt` ; `lib/reminders/customer-reminders.ts` (`isReminderDue` pur + `runCustomerReminders`) notifie l'exploitant des relances échues (une fois par échéance). Exécuté par l'ordonnanceur en même temps que le tick tontine.
- **Middleware** : `/documents`, `/growth`, `/simulator`, `/calendar`, `/trust`, `/explore` ajoutés à `PROTECTED_ROUTES`.
- **ADR 0015** ; tests `reminders/customer-reminders.test.ts` (5) → 98 unitaires ; E2E `legal-documents.spec.ts` (3) → 33 au total.

## [Non publié] — Documentation, versionnage des CGU, brouillons de formulaire (ADR 0016)

### Ajouté
- **Documentation** : `docs/support/playbook.md` (playbook agent support — principes, cycle de vie du ticket, réponse par catégorie, matrice d'escalade, réponses types) et `docs/user/getting-started.md` (guide utilisateur : compte, KYC, wallet, tontines, business, assistant, croissance, confiance).
- **Versionnage de l'acceptation des CGU (§8)** : `lib/legal/versions.ts` (source unique `LEGAL_VERSION` / `LEGAL_VERSION_LABEL` / `LEGAL_DOCS`). `User` += `termsAcceptedVersion`, `termsAcceptedAt`. L'inscription (`registerSchema` + `POST /api/v1/auth/register`) enregistre la version acceptée (défaut `LEGAL_VERSION`) dans la transaction de création + l'audit ; la page d'inscription l'affiche. `GET /api/v1/trust` renvoie un bloc `legal` (`acceptedVersion`, `acceptedAt`, `currentVersion`, `upToDate`) ; le Trust Center ajoute une section « Documents juridiques ». Pages `/legal/*` : date pilotée par `LEGAL_VERSION_LABEL`.
- **Brouillons de formulaire hors-ligne (§35)** : `hooks/useFormDraft.ts` (localStorage, préfixe `kessia:draft:`, sauvegarde à la frappe, effacement à la soumission, `try/catch` intégral) + `components/ui/DraftNotice.tsx` (bandeau « Brouillon restauré » + « Repartir de zéro »). Câblé sur `TransferForm` (wallet), `SaleForm` / `ExpenseForm` / `InvoiceForm` (business). Non câblé sur les formulaires courts ou sensibles (connexion, OTP, KYC).
- **Seed** : `termsAcceptedVersion` / `termsAcceptedAt` sur tous les comptes de démonstration.
- **ADR 0016** ; `tsc` + `lint` (0 warning) + `vitest` (98) + `build` + `playwright` (33) au vert.

## [Non publié] — Finition : jetons CSS, mur de ré-acceptation des CGU (ADR 0017)

### Corrigé / ajouté
- **Bug jetons CSS** : `tontine-detail.module.css`, `notifications.module.css` et `verify-otp.module.css` référençaient des jetons inexistants (`--color-text-primary` → `--color-text`, `--color-surface-2` → `--color-earth`, `--color-text-muted` → `--color-text-tertiary`) — texte/fonds sans couleur résolue, cassés en mode sombre. Corrigé (jetons cibles définis dans les 3 états de thème). Passes de cohérence : badges `.cat_*` des notifications, hover du bouton d'action tontine, points d'état.
- **Mur de ré-acceptation des CGU (§8)** : `isTermsUpToDate()` (pur, testé) ; `GET/POST /api/v1/legal/acceptance` (POST → pose `termsAcceptedVersion`/`At` + audit `legal.terms_accepted`) ; `components/legal/LegalGate.tsx` monté dans le layout du tableau de bord — panneau bloquant tant que la version acceptée ≠ version en vigueur (liens documents, case à cocher, « Continuer » / « Se déconnecter »).
- **ADR 0017** ; tests `legal/versions.test.ts` (3) → **101 unitaires** ; **33 E2E** inchangés (les comptes de démo sont à jour → `LegalGate` masqué). `tsc` + `lint` (0 warning) + `build` au vert.

## [Non publié] — Pièces jointes de ticket support (ADR 0018)

### Ajouté
- **Pièces jointes de ticket (§46)** : modèle `TicketAttachment` (`storageKey` bucket privé si configuré, repli `dataUrl` en base ; `isInternal` = visible des agents seulement). `lib/storage/ticket-storage.ts` (bucket `SUPABASE_TICKET_BUCKET`, URL signées 5 min, `describeAttachment()` pur + testé — images + PDF, ≤ 5 Mo, ≤ 10 / ticket).
- **`GET/POST/DELETE /api/v1/support/[id]/attachments`** : accès demandeur ou agent ; POST rate-limité, refusé si ticket fermé, `isInternal` réservé aux agents, audit `support.attachment_added` / `_removed` (jamais le contenu). Une pièce du demandeur sur un ticket `WAITING` le repasse `IN_PROGRESS`.
- **UI** : `lib/files/attachment-file.ts` (compression image / passthrough PDF côté client), `components/support/TicketAttachments.tsx` (liste + « 📎 Joindre un fichier », case « Interne » côté agent), `hooks/useSupport.ts::useTicketAttachments`. Monté dans `/support` (fil de discussion) et `/admin/support/[id]`.
- **Seed** : une pièce jointe de démonstration sur le ticket KYC d'Adjoa. `.env.example` += `SUPABASE_TICKET_BUCKET`.
- **ADR 0018** ; tests `storage/ticket-storage.test.ts` (5) → **106 unitaires** ; `e2e/support-attachments.spec.ts` (3) → **36 E2E**. `tsc` + `lint` (0 warning) + `build` + reseed au vert.

## [Non publié] — Tests d'intégration (ADR 0019)

### Ajouté
- **Suite d'intégration (§49)** : `vitest.integration.config.ts` (`*.itest.ts`, base réelle, série), `test/integration/{env-setup,helpers}.ts` (chargement `.env`/`.env.local` sans dotenv, `makeUser` / `cleanup` jetables), script `npm run test:integration`, workflow `.github/workflows/integration.yml` (Postgres 16 éphémère).
- **17 tests d'intégration** (5 fichiers) : `createLedgerEntry` (atomicité, idempotence, solde insuffisant, wallet verrouillé) ; `settlePendingPayment` (COMPLETED une fois, `ALREADY_SETTLED` au rejeu, FAILED sans ledger, `NOT_FOUND`) ; orchestrateur de tontine Projet (activation → versement → clôture, pas de double versement, versement bloqué si cotisations incomplètes) ; `checkOutboundLimit` (agrégation mensuelle, plafonds par opération / mensuel, palier 2) ; `POST /api/v1/auth/register` (compte + profil + wallet transactionnels, version CGU + audit, 409 doublon, 400 consentement).
- La suite unitaire (`npm test`) ne ramasse pas les `*.itest.ts` — elle reste rapide et sans base.
- **ADR 0019** ; `tsc` + `lint` (0 warning) + unitaires (106) + intégration (17) + `build` + `playwright` (36) au vert.

## [Non publié] — i18n : parcours d'authentification + coquille (ADR 0020)

### Ajouté / modifié
- **i18n (§38)** : `t()` accepte l'interpolation `{var}` (rétro-compatible) ; catalogue `ee` (Éwé) branché dans `CATALOGS` ; `fr.ts` réorganisé par écran et devenu la source de vérité (`nav`, `common`, `errors`, `auth.*`, `home`, `wallet`, `profile`).
- **`en.ts`** : traduction **complète** du parcours pré-connexion + navigation. **`ee.ts`** (nouveau) : `nav` + `common` de base uniquement, en-tête d'avertissement, `ready: false` — le reste retombe en français ; la traduction Éwé du vocabulaire financier / juridique / KYC doit être relue par un·e locuteur·rice natif·ve.
- **Écrans câblés `useT()`** : `login`, `register`, `verify-otp`, `onboarding` (100 % des chaînes) + `Sidebar`. Helper `withLink()` pour les libellés contenant un lien.
- **`components/i18n/LanguageSwitcher.tsx`** (nouveau) : sélecteur compact disponible **hors connexion**, ajouté aux pages d'auth + onboarding.
- **ADR 0020** ; tests `i18n/messages/catalogs.test.ts` (3) → **109 unitaires** ; `tsc` + `lint` (0 warning) + `build` + `playwright` (36) au vert.

## [Non publié] — i18n : accueil, wallet, tontines (ADR 0021)

### Ajouté / modifié
- **i18n §38** : `home-client`, `wallet-client` (+ `DepositForm` / `ReceivePanel` / `TransferForm`) et `tontine-client` (+ `JoinTontineForm` / `CreateTontineForm`) entièrement câblés sur `useT()` — en-têtes, cartes, sections, formulaires, messages d'erreur, boutons, états vides.
- Catalogue : bloc partagé `freq` (fréquences de tontine), blocs `home` / `wallet` / `tontine` étoffés (≈ 130 clés) dans `fr.ts` + `en.ts`. Collisions de portée `t` réglées (`.map((tn) => …)` / `((tx) => …)`).
- **Hors périmètre assumé** : `lib/tontine/type-meta.ts` (métadonnées des 4 types, consommées par ~6 écrans) et les sorties des utilitaires de formatage restent en français — passes dédiées.
- **ADR 0021** ; `tsc` + `lint` (0 warning) + `vitest` (109) + `build` + `playwright` (36) au vert.

## [Non publié] — i18n : type-meta, profil, support (ADR 0022)

### Ajouté / modifié
- **i18n §38** : `lib/tontine/type-meta-i18n.ts` (nouveau) — hooks `useTontineTypeMeta()` / `useTontineTypeList()` qui surchargent en langue les métadonnées des 4 types de tontines, `type-meta.ts` restant en FR (repli + usage serveur par l'orchestrateur). `tontine-client` et `tontine/[id]/tontine-detail-client` basculés sur ces hooks.
- **`profile-client.tsx`** entièrement câblé sur `useT()` — badges, KESSIA Score, bannière KYC (interpolations `{status}` / `{level}` / `{count}`), statistiques, bannière IA, menu, modales type de compte + thème. Constantes `KYC_LABEL` / `THEME_LABEL` supprimées.
- **`support-client.tsx`** + **`components/support/TicketAttachments.tsx`** entièrement câblés — contact, liste de tickets (`status` / `cat`), FAQ, `CreateTicketForm`, `TicketThread`, pièces jointes.
- Catalogue `fr.ts` + `en.ts` : blocs `tontineType.*` (label/tagline/description/step1-4), `kyc.status.*` (7 états), `profile` (≈ 40 clés), `support` étoffé (≈ 55 clés).
- **Hors périmètre assumé** : `type-meta.ts` lui-même, `user-type.ts`, écrans profil secondaires, admin support, utilitaires de formatage, relecture native éwé.
- **ADR 0022** ; `tsc` + `lint` (0 warning) + `vitest` (109) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n : landing + utilitaires de formatage (ADR 0023)

### Ajouté / modifié
- **i18n §38** : la **landing** est traduite FR / EN — `app/page.tsx` reste serveur (`metadata` seule), nouveau `app/landing-client.tsx` (`'use client'`) câble `useT()` sur tout le contenu (nav, hero, piliers, 6 fonctionnalités, « 3 minutes », CTA, pied de page). Bloc catalogue `landing.*` (~70 clés).
- **Libellés des utilitaires de formatage** : `lib/utils/format.ts` (fonctions pures) reçoit un singleton `FormatMessages` poussé par `I18nProvider` via `setFormatMessages()` — même modèle que `setFormatLocale()`. `describeTransaction()`, `formatRelativeDate()` (mots-charnière + interpolation `{n}`/`{time}`) et le nouveau `formatFrequency()` sont localisés ; `TONTINE_FREQ_LABELS` conservé (déprécié). Côté serveur (back-office), le singleton reste FR.
- Bloc catalogue `format.*` (justNow, minutesAgo, today, yesterday, freq, tx) dans `fr.ts` + `en.ts`. `tontine-detail-client` bascule sur `formatFrequency()`.
- **Résultat** : le chemin onboarding → wallet → tontine → business s'affiche intégralement en anglais.
- **ADR 0023** ; `tsc` + `lint` (0 warning) + `vitest` (112, +3 `format.test.ts`) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n : Business + Explorer (ADR 0024)

### Ajouté / modifié
- **i18n §38** : **Business** (`business-client` liste + `business-detail-client` — 11 onglets, KPI, états vides, filtres, 7 formulaires modaux) et **Explorer** (`explore-client`) entièrement câblés sur `useT()`. Blocs catalogue `business.*` (~180 clés) et `explore.*` (~40) dans `fr.ts` + `en.ts`, avec interpolations `{count}`/`{date}`/`{amount}`/`{name}`.
- **`lib/modules/i18n.ts`** (nouveau) — `useModuleCatalog()` localise name/tagline/description des ~16 modules + `STATUS_LABEL` ; `lib/modules/catalog.ts` reste FR pour `/admin/modules` (serveur).
- Énums localisés côté client depuis la donnée brute : `InvoiceStatus`, `CustomerSegment`, `GoalMetric`/`GoalPeriod`, moyens de paiement, catégories de dépense, secteurs (plus besoin des libellés pré-calculés serveur `g.metricLabel`…).
- **Hors périmètre assumé** : prose analytique calculée côté serveur (bandes de santé ADN, `needs[]`, `runwayNote`, mois de trésorerie, sections du plan d'affaires), `user-type.ts`, back-office `/admin/*`.
- **ADR 0024** ; `tsc` + `lint` (0 warning) + `vitest` (112) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n : Trust Center, croissance, simulateurs, assistant (ADR 0025)

### Ajouté / modifié
- **i18n §38** : `trust-client`, `growth-client`, `simulator-client` (3 onglets) et `ai-client` entièrement câblés sur `useT()`. **Tous les écrans destinés à l'utilisateur final sont désormais FR / EN.** Blocs catalogue `trust.*`, `growth.*`, `simulator.*`, `ai.*` dans `fr.ts` + `en.ts`.
- **`lib/simulator/tontine.ts`** : `simulateTontine()` (pure) renvoie désormais un descripteur `positionKind` + `myPosition` en plus de `positionNote` (FR) — l'écran reconstruit la phrase via `t()`. Simulateur : `TONTINE_TYPES` → `useTontineTypeList()`, `FREQ_LABEL` local → `formatFrequency()`.
- **Hors périmètre assumé** : prose calculée côté serveur (`trust.fees`/`disclaimers`, `plan.headline`/`step.*`, opportunités & insights), `user-type.ts` (`aiPrompts`), back-office, écrans profil secondaires.
- **ADR 0025** ; `tsc` + `lint` (0 warning) + `vitest` (112) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n : profils utilisateur + écrans profil secondaires (ADR 0026)

### Ajouté / modifié
- **i18n §38** : `lib/user/user-type-i18n.ts` (nouveau) — `useUserTypeMeta()` localise label/hint/`firstSteps`/`aiPrompts` des 5 profils MVP ; `user-type.ts` reste FR (registerSchema, serveur). `home-client`, `ai-client`, `profile-client` basculés dessus.
- Écrans câblés `useT()` : `/profile/{kyc, score, security, notifications, privacy}` — les 7 états KYC + zones d'upload, KESSIA Score, mot de passe/2FA/sessions, préférences de notification, consentements/export RGPD/suppression de compte.
- Blocs catalogue `userType.*`, `kycPage.*`, `scorePage.*`, `securityPage.*`, `notifPrefs.*`, `privacyPage.*` dans `fr.ts` + `en.ts`.
- **Résultat** : plus aucun texte FR en dur dans un écran membre (hors prose analytique générée côté serveur : `score.factors`/`advice`, libellés de consentement, motif de rejet KYC).
- **ADR 0026** ; `tsc` + `lint` (0 warning) + `vitest` (112) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n serveur : prose analytique (ADR 0027)

### Ajouté / modifié
- **i18n §38** : `lib/i18n/core.ts` (cœur sans React : `makeTranslate`) + `lib/i18n/server.ts` (`serverT()` lit le cookie `kessia-locale` via `next/headers`). `I18nProvider` écrit désormais la locale dans un cookie en plus du `localStorage`.
- **Générateurs traduits** : `lib/score/score.service.ts` (bandes, 9 facteurs, tous les détails avec interpolation, conseils), `lib/business/dna.ts` (santé, signaux, besoins), `lib/growth/rules.ts` (`buildGrowthSteps(s, t)` — ~15 étapes) + `lib/growth/plan.ts` (headline, catégories). Blocs catalogue `srvScore.*` / `srvDna.*` / `srvGrowth.*`.
- **Split client/serveur** : `lib/business/plan-shared.ts` (nouveau — types + `PLAN_SECTIONS`, sans dépendance serveur) sort de `plan.ts` pour ne pas tirer `next/headers` dans le bundle client.
- **Hors périmètre assumé** : opportunités, insights, frais (`lib/fees.ts`), notes de trésorerie — mêmes rails, passe suivante. Back-office.
- **ADR 0027** ; `tsc` + `lint` (0 warning) + `vitest` (112) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n serveur : opportunités, insights, frais, trésorerie (ADR 0028)

### Ajouté / modifié
- **i18n §38** : sur les rails d'ADR 0027, `lib/opportunities/engine.ts` (8 types d'opportunités), `lib/insights/insights.service.ts` (~15 insights), `lib/fees.ts` (`FEES` → `feeLines(t)` / `feesSummary(t)`), `lib/business/treasury.ts` (mois + notes de runway) et `app/api/v1/trust/route.ts` (mentions réglementaires, note du Fonds de Garantie, paliers KYC) sont traduits FR / EN.
- `lib/i18n/server.ts` : `serverNumber(n)` pour les montants interpolés (`12 500` / `12,500`).
- Blocs catalogue `srvOpps.*`, `srvInsights.*`, `srvFees.*`, `srvTreasury.*`, `srvTrust.*`.
- **Résultat** : toute la prose serveur destinée au membre est bilingue (vérifié end-to-end via l'API `/trust` et `/opportunities` avec le cookie de langue).
- **ADR 0028** ; `tsc` + `lint` (0 warning) + `vitest` (112) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — Audit de conformité complet (31 août 2026)

### Documentation
- **`docs/progress/audit-2026-08-31.md`** : revue systématique des 62 § contre le code (39 modèles Prisma, ~75 routes API, 1 seul `// TODO` réel). Rapport jugé fidèle, **aucune régression**.
- Corrections : `docs/compliance/matrix.md` (endpoint d'effacement `POST /api/v1/profile/privacy {action:'delete-request'}`, date de revue 0018→0028) ; rapport artifact §39 (mention de rate limiting obsolète alignée sur Upstash/ADR 0014) + panneau dette (pages `/legal/*` FR seulement) + note de méthode.
- Écarts non bloquants listés dans l'audit : i18n `/legal/*` et `/admin/*`, `feesSummary(t)` inutilisé, tests §49 à étendre.

## [Non publié] — Tests : reversal, tontine Croissance, RBAC route, i18n core (ADR 0029)

### Tests
- **`lib/i18n/core.test.ts`** (7) — `interpolate` / `resolve` / `makeTranslate` (repli locale → fr → clé, prose serveur `srv*` en anglais, cohérence `en ⊆ fr`).
- **`test/integration/transfer-reversal.itest.ts`** (2) — crédit destinataire impossible (wallet verrouillé) → `REVERSAL` + solde rétabli + audit `reversed:true` ; transfert nominal sans reversal.
- **`test/integration/tontine-growth.itest.ts`** (1) — tontine `GROWTH` : N tours sans versement puis restitution de `totalContributed` à chaque membre, net = 0, idempotent.
- **`test/integration/admin-rbac.itest.ts`** (3) — `USER` → 403 sur les 10 familles `/admin/*` ; sans token → 401 ; `SUPER_ADMIN` jamais bloqué.
- **119 unitaires** (+7) + **23 intégration** (+6) + 36 E2E.
- **ADR 0029** ; `tsc` + `lint` (0 warning) + `vitest` (119) + `test:integration` (23) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n back-office `/admin/*` (ADR 0030, dernier bloc §38)

### Ajouté
- **i18n §38 — back-office** : les ~17 fichiers TSX de `/admin/*` (sidebar, garde,
  dashboard, utilisateurs, KYC + revue, transactions, tontines, support + ticket,
  Fonds de Garantie, anti-fraude, modules, analytics) sont FR / EN. Sidebar
  extraite dans `app/admin/sidebar.tsx` (`'use client'`, `useT()`) ; `layout.tsx`
  reste serveur. `app/admin/pills.tsx` : les 4 helpers prennent `t: Translate`
  (libellé via `admin.pill.*`, classe CSS locale).
- **Prose serveur admin** : `lib/admin/copilot.ts` (`computeAdminPriorities()`,
  6 priorités du jour) via `serverT()` (`admin.priorities.*`).
  `lib/analytics/platform.ts` = agrégats purs, rien à traduire.
- Bloc catalogue `admin.*` (~230 clés) dans `fr.ts` + `en.ts` ; parité en/ee ⊆ fr
  vérifiée par `catalogs.test.ts`.
- `analytics/page.tsx` : `fcfa()` local → `formatCurrency()`, `toLocaleString
  ('fr-FR')` → `formatDate()` (locale-aware).

### Périmètre §38
- **§38 = 🟢** : espace membre + back-office + prose serveur tous FR / EN.
  Hors périmètre, documenté : relecture native éwé (finance/légal/KYC) et pages
  `/legal/*` (après validation juridique du texte FR).

### Vérification
- **ADR 0030** ; `tsc` + `lint` (0 warning) + `vitest` (119) + `build` +
  `admin-rbac.itest` (3) au vert. E2E `admin.spec` : heading dashboard vert ; les
  2 tests data-dépendants ont échoué sur une indisponibilité Supabase concomitante
  (P1001 sur `db:seed` au même moment) — snapshot DOM localisé correct, à rejouer
  base rétablie.

## [Non publié] — Wallet séquestre par tontine (ADR 0031, §6.5)

### Ajouté
- **Compte séquestre par tontine** : chaque tontine possède un wallet
  `TONTINE_ESCROW` dédié qui **détient réellement** les cotisations d'un cycle
  entre l'encaissement et le versement — adossé au ledger, plus de cagnotte
  « nulle part ». `Wallet` : `userId` nullable, `+ tontineId @unique`,
  `+ kind WalletKind`. `TontineEventType += ESCROW_SHORTFALL`.
- **`postDoubleEntry`** (`lib/ledger/ledger.service.ts`) : écriture à double
  entrée entièrement atomique entre deux wallets (`SELECT … FOR UPDATE` sur les
  deux lignes dans l'ordre lexicographique, garde de solde, idempotence).
  `createLedgerEntry` gagne aussi le verrou de ligne → **toutes** les opérations
  financières sont protégées du double-débit concurrent.
- **Flux** : cotisation = débit membre → crédit séquestre (`settleContribution`) ;
  versement = débit séquestre → crédit bénéficiaire (`checkAndAdvanceRound`).
  **Garde de sûreté** : jamais de versement > fonds détenus ; en cas de manque,
  refus + événement `ESCROW_SHORTFALL` + log, tontine laissée ACTIVE.
- **Rapprochement** (`lib/tontine/escrow.ts`) : `reconcileTontineEscrow` →
  `{ held, expectedHeld, drift, balanced }` (invariant : solde séquestre ==
  Σ cotisations PAID − Σ `totalReceived`). `refundTontineEscrow` (helper défensif
  d'annulation, testé, non câblé).
- **Surfaces** : `GET /tontine/[id]` → `escrow` pour les membres (« 🔒 X FCFA en
  séquestre pour le groupe ») ; `/admin/tontines` → colonne Séquestre + badge
  « écart » (3 requêtes groupées) ; `/admin/analytics` → KPI « Détenu en séquestre
  (réel) ». `wallet.totalHeld` + volume ledger admin filtrent `kind: USER`.
  Catalogue `admin.tontines.{thEscrow,escrowNote,driftBadge,driftTitle}` +
  `admin.analytics.kEscrowHeld`, FR + EN.

### Nettoyage (p0-4)
- `feesSummary(t)` (code mort, ADR 0028) supprimé + clé `srvFees.summaryLine`
  retirée des catalogues.

### Tests
- `tontine-orchestrator` + `tontine-growth` réécrits escrow-aware (le circuit de
  cotisation passe par le séquestre via `settleContribution` / helper
  `contributeRound`).
- **`test/integration/tontine-escrow.itest.ts`** (4) : invariant vérifié à chaque
  étape d'un cycle rotatif 2×2 + conservation de la masse monétaire ; versement
  refusé si le séquestre est sous-financé (`ESCROW_SHORTFALL`) ;
  `refundTontineEscrow` prorata + idempotent ; propriétés de `postDoubleEntry`
  (atomicité / idempotence / garde de solde / verrou destination).
- **23 → 27 tests d'intégration** (+4). Les 6 suites pré-existantes (ledger,
  reversal, webhooks, RBAC, register, plafonds KYC) restent vertes — le verrou de
  ligne ajouté à `createLedgerEntry` ne casse rien.
- p0-4 : `feesSummary(t)` (code mort, ADR 0028) supprimé + `srvFees.summaryLine`
  retiré des catalogues.

### Vérification
- **ADR 0031** ; `tsc` + `lint` (0 warning) + `vitest` (119) + **`test:integration`
  (27)** + `build` + `db:seed` au vert. Rapprochement des 5 tontines seedées
  actives/terminées : `held == expectedHeld` partout (Σ séquestres = 325 000 FCFA).
  E2E 8/8 (dont `tontine-lifecycle` : cycle complet via le séquestre).

## [Non publié] — PDF serveur, e-mail, cache offline (ADR 0032, §7 / §35 / §51)

### Ajouté
- **PDF côté serveur, sans navigateur** : `lib/pdf/mini-pdf.ts` — générateur A4
  maison, polices standard Helvetica non intégrées, aucune dépendance.
  `renderInvoicePdf` / `renderReceiptPdf`. Routes
  `GET /api/v1/business/[id]/invoices/[invoiceId]/pdf` et
  `GET /api/v1/wallet/transactions/[id]/pdf` (flux `application/pdf`). Liens
  « ⬇ PDF » sur les documents et la ligne de facture.
- **`withAuth` accepte le cookie `kessia-access-token` sur les GET seulement** —
  téléchargement direct d'un PDF depuis le navigateur, zéro surface CSRF.
- **E-mail transactionnel** : `lib/email/email.ts` — Resend si `RESEND_API_KEY`,
  sinon SIMULATION journalisée (même patron que push/SMS).
  `POST /api/v1/business/[id]/invoices/[invoiceId]/email` (PDF en pièce jointe,
  audit `business.invoice_emailed` — domaine destinataire seulement, rate-limit
  10 / 10 min). `.env.example` : `RESEND_API_KEY`, `EMAIL_FROM`.
- **Bandeau hors ligne (§51)** : `hooks/useOnline.ts` + `components/ui/
  OfflineBanner.tsx` (monté dans le layout dashboard + `AdminGuard`).
  `ErrorNote` devient offline-aware et passe à l'i18n (`common.*`).
- **Service worker `kessia-v2`** : navigations réseau-d'abord (timeout 3,5 s) →
  coquille de la même route en cache → `/offline` ; 6 coquilles pré-cachées
  (`/home`, `/wallet`, `/tontine`, `/business`, `/profile`, `/login`) ; cache NAV
  plafonné à 16 entrées. `/api/**` reste réseau-uniquement. `/offline` :
  « Réessayer » réel + rechargement auto au retour du réseau.

### Vérification
- **ADR 0032** ; `tsc` + `lint` (0 warning) + `vitest` (**124**, +5) + `build` au
  vert. Vérifié en direct sur le build : PDF facture (3,4  ko) + reçu (2,3 ko)
  `%PDF-1.4…%%EOF`, e-mail `{ sent:true, simulated:true }`. E2E 13/13 sur le run
  ciblé (dont `navigation` bandeau hors ligne §51, `legal-documents` PDF + e-mail
  simulé §7) — suite totale 38.

## [Non publié] — KPI §54, anti-fraude comportemental, voix (ADR 0033)

### Ajouté
- **KPI back-office plus fins** (`lib/analytics/platform.ts`, `/admin/analytics`) :
  axe **Finance** (revenu KESSIA = Σ `FEE` 30 j + total, flux net dépôts−retraits,
  volumes transferts / retraits / versements, solde moyen), axe **Activation**
  (comptes activés, actifs 7 j / 30 j via `lastLoginAt`, assiduité, **entonnoir
  KYC** en barre empilée), axe **Assistant IA** (conversations / messages /
  utilisateurs engagés 30 j, répartition par contexte, **`answerMix`** : part des
  réponses données / KB / repli). `POST /ai/chat` marque chaque réponse d'un
  `metadata.source`. Catalogue `admin.analytics.*` (~25 clés) FR + EN.
- **Anti-fraude comportemental** (`lib/fraud/rules.ts`, +5 signaux) : `pass_through`
  (layering), `structuring` (smurfing sous plafond), `new_recipient_high_value`,
  `velocity_accel`, `odd_hour`. `engine.ts` : nouvelles fenêtres (1 h, moyenne
  30 j, 1ᵉʳ transfert au bénéficiaire) + **déduplication** — une alerte ouverte
  récente est enrichie (score max, signaux fusionnés) au lieu d'être dupliquée ;
  notification `SECURITY` seulement en cas d'escalade. Toujours **aucun blocage
  automatique**.
- **Miniatures des pièces jointes** (§46) : `TicketAttachment += thumbnail`.
  `prepareAttachment` produit une vignette JPEG ~180 px (≤ 60 ko) ;
  `sanitizeThumbnail` (serveur, PUR, testé) ; `TicketAttachments` affiche une
  vignette 40 px `loading="lazy"` cliquable. L'original inchangé.
- **Couverture voix (§34)** : `lib/voice/commands.ts` — +7 destinations,
  **mots-clés + déclencheurs anglais** sur toutes les routes, intention **retour
  arrière** (`href:'back'` → `router.back()`).

### Non fait, par choix
- **Thème sombre de la landing** : `app/page.module.css` est un design mono-thème
  clair assumé ; rétrofit à risque, sans revue visuelle possible. Documenté.

### Vérification
- **ADR 0033** ; `tsc` + `lint` (0 warning) + `vitest` (**135**, +11 :
  anti-fraude, miniatures, voix) + `build` au vert.

## [Non publié] — Corrections de l'auto-audit (ADR 0034)

### Ajouté
- **PDF validé par un vrai lecteur** : `pdf-lib` en `devDependency` (test
  uniquement — le générateur `lib/pdf/mini-pdf.ts` reste sans dépendance).
  `mini-pdf.test.ts` gagne un bloc **intégrité binaire** (7 tests) : offsets
  `xref` → `N 0 obj`, `trailer /Size` == entrées xref, `/Length` de chaque flux
  == octets réels, `/Count` == objets `Page`, et **`pdf-lib` ouvre + re-sérialise**
  facture / reçu / doc multi-pages (dimensions A4 exactes).
- **i18n §38 — 2 derniers écrans** : blocs de catalogue `tontineDetail.*` (~55),
  `calendar.*` (~15), `srvCalendar.*` (4, titres d'événements serveur) FR + EN.
  `tontine-detail-client.tsx`, `calendar-client.tsx` et `lib/calendar/aggregate.ts`
  (via `serverT()`) n'ont plus de chaîne FR en dur. **§38 reste 🟢** — la
  revendication est maintenant exacte.
- **KPI §54 sous test** : `test/integration/platform.itest.ts` (2 tests, base
  réelle) — contrat de forme + invariants (pourcentages ∈ [0,100], `7j ≤ 30j`,
  `Σ kycFunnel == total`, `netInflow == dépôts − retraits`, 30 buckets jour) et
  réactivité (utilisateur + `DEPOSIT` `COMPLETED` → `total` **et** `activated`
  +1, `totalHeld` / `depositVolume30d` du montant exact).

### Sécurité
- `docs/security/overview.md` : section **« Décisions à valider par une revue
  sécurité externe »** — repli cookie **GET-only** de `withAuth` (ADR 0032) et
  `SELECT … FOR UPDATE` global sur le ledger (ADR 0031) : justification, périmètre
  du risque, points à challenger, bloquants pilote (test de charge + `pg_locks`).

### Vérification
- **ADR 0034** ; `tsc` + `lint` (0 warning) + `vitest` (**143**, +8 PDF) +
  `build` + **`test:integration` 29** (dont `platform` ; escrow rejoué après une
  coupure passagère du pooler Supabase) + **E2E 38/38** + `db:seed` au vert.

## [Non publié] — Deux couleurs d'accent + Tontine Achat individuelle (ADR 0035)

### Ajouté
- **Couleur d'accent au choix** (§36) : la teinte signature `#B65A3A`
  (« Terracotta ») **ou** la teinte d'origine `#C84B1E` (« Brique »). Nouvelle
  entrée « Couleur d'accent » dans le profil (à côté d'« Apparence »), appliquée
  via `data-accent` sur `<html>` avec script anti-flash, persistée par
  navigateur. `globals.css` : bloc `[data-accent='brique']` surchargeant toute
  la famille `--color-primary*`, gradients, focus et ombres, avec réajustement
  des nuances en mode sombre (3 états).
- **Tontine Achat — formule individuelle** (§6.4) : en plus de l'achat groupé
  (cagnotte tournante), une personne peut créer un **plan d'achat pour elle
  seule**. Elle saisit l'article et son prix + le nombre de versements ; KESSIA
  calcule chaque échéance. Les versements sont **détenus sur le compte séquestre
  jusqu'au dernier**, puis recrédités en totalité sur son wallet pour l'achat.
  Un seul membre, aucun code d'invitation, démarrage immédiat.
  - Schéma : `enum PurchaseMode { GROUP SOLO }` ; `Tontine += purchaseMode`,
    `purchaseItem`, `targetAmount`.
  - `resolveDistribution()` + `soloContributionAmount()` (`lib/tontine/type-meta.ts`).
  - L'orchestrateur route le mode `solo` par le chemin de restitution
    `growth` — mêmes garanties séquestre (§6.5) : double écriture atomique,
    verrou de ligne, « jamais plus que détenu », idempotence, réconciliation.
  - Contrat numérique, API (`superRefine`), refus de `join`, UI de création et
    de détail adaptées ; catalogue `tontine.*` / `tontineDetail.*` FR + EN.
  - Seed : 1 plan solo `PENDING` (Kossi — presse à jus, 180 000 FCFA / 6).

### Vérification
- **ADR 0035** ; `tsc` + `lint` (0 warning) + `vitest` (**147**, +4) + `build` +
  **`test:integration`** (nouveau `tontine-solo.itest.ts` ; suite tontine 7/7)
  + **E2E 40/40** (+ plan solo, + bascule couleur Brique persistée) + `db:seed`
  (7 tontines). Le test `wallet` « transfert refusé » a échoué une fois sur
  instabilité du pooler puis passé au rejeu — pas une régression.

## [Non publié] — Mise en ligne + mode démonstration (ADR 0036)

### Déploiement
- **En ligne : https://kessia-dun.vercel.app** — dépôt GitHub
  `essotakougnadi-arch/kessia` + Vercel en **déploiement continu** (chaque push
  sur `main` redéploie). Build `prisma generate && next build` + `postinstall`,
  Root Directory `kessia-app`, 15 variables d'env, cron tontine quotidien (Hobby).
  Vérifié : `/api/health` = `db: ok`, login compte de démo → jetons émis.
- **Environnement de démonstration** : base Supabase de dev, `SMS_PROVIDER=DEV`.

### Ajouté
- **Mode démonstration** (`lib/config/demo.ts`) : `DEMO_MODE=1` fait renvoyer le
  code OTP par `POST /auth/register` et `POST /auth/request-otp` (champ `demoOtp`),
  pré-rempli sur `/verify-otp` avec un encart dédié. **Garde-fou** : inactif si
  `SMS_PROVIDER ≠ DEV` ; avertissement de sécurité journalisé (même posture
  qu'`E2E_RATE_LIMIT_BYPASS`).
- **`NEXT_PUBLIC_DEMO_MODE=1`** : `/login` affiche les comptes de test
  (Membre / Micro-entreprise / Conformité / Admin) — un clic pré-remplit le
  formulaire. Clés `auth.login.demo*` + `auth.verifyOtp.demoNote` FR + EN.
- **`README.md` à la racine du dépôt** (page d'accueil GitHub) + `kessia-app/README.md`
  mis à jour (déploiement, mode démo, structure `admin/*`). `.env.example` :
  `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE`. `.gitignore` : `.vercel`.

### Vérification
- **ADR 0036** ; `tsc` + `lint` (0 warning) + `vitest` (147) + `build` + E2E auth
  (7/7) au vert. Déploiement continu confirmé (5 pushs → 5 builds `READY`).

## [Non publié] — Choix du pays au téléphone (ADR 0037)

### Ajouté
- **`lib/constants/countries.ts`** : **16 pays d'Afrique de l'Ouest** (15 États
  CEDEAO + Mauritanie ; UEMOA d'abord, Togo par défaut), affichés « 🇹🇬 +228 »,
  helpers `toE164`, `findCountry`, `isNationalLengthPlausible`,
  `readStoredCountryIso` / `storeCountryIso` (mémorise le dernier pays dans
  `localStorage`).
- **`components/auth/CountryPhoneField.tsx`** : liste déroulante maison
  (`combobox` + `listbox`, clavier + type-ahead) avec **drapeaux SVG réels**
  (`public/flags/<iso>.svg`, 16 fichiers ~8 Ko) — le `<select>` natif n'affiche
  pas les drapeaux emoji sous Windows. Champ contrôlé, deux champs cachés
  (`phone` en E.164, `country` en ISO), libellé d'aide dynamique, cue de
  longueur non bloquant, thème clair/sombre.
- `countries.test.ts` (6 tests).

### Modifié
- `/register` et `/login` (mot de passe **et** OTP) : `CountryPhoneField` à la
  place du préfixe `+228` en dur ; le handler compose le numéro E.164.
- `registerSchema` : `country` optionnel (ISO alpha-2) → `UserProfile.country`.
- i18n FR + EN : `auth.{login,register}.countryLabel`, `auth.register.phoneError`.
- Interface (hors ADR) : logos officiels PNG transparents (couleur / blanc) à la
  place du JPEG rogné en CSS ; cartes « Fonctionnalités » de la landing centrées
  + icônes animées.

### Vérification
- **ADR 0037** ; `tsc` + `lint` (0 warning) + `vitest` (**153**, +6) + `build` au vert.

## [Non publié] — Découverte de tontines & demandes d'adhésion (ADR 0038)

### Ajouté
- **`GET /api/v1/discover`** (publique) : tontines `isPublic` + `PENDING` +
  non pleines, triées par date de création.
- **`TontineJoinRequest`** + `enum JoinRequestStatus` + `Tontine.membershipConditions`
  (texte libre). `lib/tontine/join.ts` `describeJoinability()` (+ 7 tests).
- **`POST/GET /api/v1/tontine/[id]/join-requests`** + **`PATCH …/[requestId]`**
  (`approve` / `reject` + motif par le gestionnaire ; `cancel` par le candidat
  via `requestId = "me"`). L'acceptation crée le membre et démarre la tontine
  si elle devient complète. Notifications à chaque étape.
- **`GET /api/v1/tontine/[id]`** enrichi : `membershipConditions`,
  `myJoinRequest`, `pendingJoinRequestCount`.
- **`components/discover/DiscoveryRail.tsx`** (rail / grille) sur la landing
  (« Tontines ouvertes en ce moment ») et l'accueil ; **page publique
  `/discover`** (hors `PROTECTED_ROUTES`).
- **Détail tontine** : `JoinRequestPanel` (candidat) + `ManageRequestsPanel`
  (gestionnaire) ; sections membres masquées aux non-membres.
- `useAuth.finishSession` : redirection `?next` / `?from` / intention stockée
  (chemins internes) au lieu de `/home` en dur.
- i18n FR + EN : `discover.*`, `tontineJoin.*`, `tontineRequests.*`.
- Seed : 4 tontines publiques ouvertes + 4 demandes de démonstration.

### Vérification
- **ADR 0038** ; `tsc` + `lint` (0 warning) + `vitest` (**160**, +7) + `build`
  + E2E (auth, tontine-lifecycle) au vert. Smoke test API du parcours complet.
