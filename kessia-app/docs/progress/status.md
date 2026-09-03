# État d'avancement — KESSIA App

_Dernière mise à jour : 2026-09-03 (**déployé et opérationnel : https://kessia-dun.vercel.app** — GitHub `essotakougnadi-arch/kessia` + Vercel, déploiement continu, env de démonstration ; `/api/health` = `db: ok`, login compte démo OK) — + ADR 0036 mode démonstration (OTP renvoyé par l'API si `DEMO_MODE=1`, comptes de test sur `/login`) + README dépôt ; + ADR 0035 : 2 couleurs d'accent au choix `#B65A3A` / `#C84B1E` via `data-accent` + Tontine Achat individuelle `PurchaseMode.SOLO` ; + ADR 0034 corrections auto-audit ; + ADR 0033 KPI §54 / anti-fraude comportemental / voix EN ; + ADR 0032 PDF serveur / e-mail / offline ; + ADR 0031 wallet séquestre)_

Référence : cahier des charges final (61 §) + feuille de route par phases (§52).

## Déploiement (2026-09-03, ADR 0036)

- **En ligne** : https://kessia-dun.vercel.app — Vercel (plan Hobby), **déploiement continu** à chaque push sur `main` du dépôt GitHub `essotakougnadi-arch/kessia` (privé). Confirmé : 5 pushs → 5 builds `READY`.
- Build : `prisma generate && next build` (+ `postinstall`), Root Directory `kessia-app`, 15 variables d'env, cron tontine quotidien (limite Hobby).
- **Environnement de démonstration** : base Supabase de dev (comptes de démo), OTP en mode `DEV`. Vérifié : `/api/health` → `db: ok`, login `+22890000001` / `Kessia2026!` → jetons émis.
- **Mode démo** (`DEMO_MODE=1` + `NEXT_PUBLIC_DEMO_MODE=1`) : l'API renvoie l'OTP (garde-fou : inactif si `SMS_PROVIDER ≠ DEV`), `/login` propose les comptes de test. `lib/config/demo.ts`.
- **`README.md` à la racine du dépôt** (page GitHub) créé.
- Reste pour un env. **régulé** : base de production séparée, APM sur `/api/metrics`, gestionnaire de secrets, Redis Upstash, secret ordonnanceur, rétention + copie backup + test DR (cf. bloquants pilote).

## Légende
✅ fait · 🟡 partiel · ❌ à faire · ⏭️ hors MVP (Phase 8+)

## Phase 0 — Fondation
| Élément | État | Note |
|---|---|---|
| Architecture (modular monolith) | ✅ | Next.js App Router + API routes + Prisma (ADR 0001) |
| Base de données PostgreSQL | ✅ | Supabase via pooler (ADR 0002) ; entités MVP + `PaymentTransaction` |
| Design system (tokens) | 🟡 | `#B65A3A` (§36) · **couleur d'accent au choix `#B65A3A` (Terracotta) / `#C84B1E` (Brique) via `data-accent`** (ADR 0035) · dark mode 3 états ✅ · jetons morts corrigés (ADR 0017) · hex restant volontaire (marque sombre, texte sur couleur, QR, accent IA, landing mono-thème) |
| Auth / sécurité | 🟡 | OTP, sessions JWT+refresh, lockout, validation backend ✅ · audit log ✅ · **rate limiting ✅ Upstash Redis si configuré, repli mémoire** (ADR 0004/0014) · **MFA/TOTP + codes de secours ✅** (ADR 0006) · **middleware edge : JWT vérifié + rôle `/admin/*` ✅** · **anti-fraude à base de règles + revue humaine ✅** (§32, ADR 0013) · **plafonds KYC serveur ✅** (§30) · biométrie/liveness KYC + screening habilité ❌ (prestataire IDV) · `docs/security/overview.md` |
| **Observabilité** | 🟡 | `lib/logger.ts` + `logApiError` ✅ · `GET /api/health` ✅ · **`GET /api/metrics` (Prometheus, jeton) ✅** (§47) · APM/traces/alertes ❌ |
| **Backups / DR (§48)** | 🟡 | `scripts/db-backup.mjs` + runbook `docs/operations/backup-recovery.md` (restauration, RPO/RTO, test trimestriel, réponse à incident) ✅ · rétention 30 j + copie hors-hébergeur + test DR consigné ❌ (infra) |
| **CI/CD** | 🟡 | `.github/workflows/` : `ci.yml` ✅ · `integration.yml` ✅ (ADR 0019) · `e2e.yml` ✅ · `staging.yml` (squelette) ✅ · `cron.yml` (tick tontine planifié) ✅ · staging/prod réels ❌ (§50) |
| Observabilité | 🟡 | `lib/logger.ts` (winston) + `logApiError` sur ~40 routes ✅ · `GET /api/health` ✅ · APM/alertes ❌ (§47) |
| **Conformité (§59)** | 🟡 | `docs/compliance/matrix.md` (10 domaines, statut par ligne, bloquants pilote) ✅ · droits RGPD (export/portabilité + demande de suppression) ✅ — voir Phase 1 · validation conseil juridique ❌ |
| **Tests** | 🟡 | **147 tests unitaires** (vitest ; `mini-pdf` : intégrité binaire + `pdf-lib` ; `resolveDistribution` / `soloContributionAmount` / contrat solo) ✅ · **31 tests d'intégration** (`*.itest.ts`, base réelle — ledger, webhooks, orchestrateur tontine Projet + **Croissance** + **séquestre** + **Achat solo** (activation 1 membre, restitution intégrale au dernier versement, garde groupe « ≥ 2 » intacte), plafonds KYC, route register, **reversal de transfert**, **RBAC `/admin/*`**, **KPI plateforme §54**) ✅ · **40 E2E** Playwright (+ bandeau hors ligne, + PDF/e-mail, + plan d'achat solo, + bascule couleur d'accent) ✅ · `ci.yml` · `integration.yml` (Postgres jetable) · `e2e.yml` · `staging.yml` · `cron.yml` |

## Phase 1 — Identity
| Élément | État |
|---|---|
| Inscription / connexion / profil (`/api/v1/profile`) | ✅ |
| **Acceptation des CGU versionnée (§8)** : `lib/legal/versions.ts` (source unique + `isTermsUpToDate()`) ; `User.termsAcceptedVersion` + `termsAcceptedAt` posés à l'inscription (+ audit) ; `GET/POST /api/v1/legal/acceptance` ; **`LegalGate` — panneau bloquant de ré-acceptation** monté dans le layout tableau de bord ; Trust Center « Documents juridiques » | ✅ (ADR 0016/0017) |
| **Profils utilisateur §4** : `userType` déclaratif (5 profils MVP + 6 réservés Phase 8), collecté à l'inscription, élévation de rôle auto (`TONTINE_MANAGER` / `BUSINESS_OWNER`) | ✅ (ADR 0010, `docs/product/overview.md`) |
| **Parcours adapté §4** : accueil réordonné par profil + carte « Premiers pas », suggestions KESSIA AI par profil (`firstSteps` / `aiPrompts` dans `lib/user/user-type.ts`) | ✅ (ADR 0011) |
| KYC (statuts §30, pièces, motifs de rejet, aide IA) | ✅ · **stockage Supabase Storage** (bucket privé + URL signées) quand configuré, repli data-URI sinon (ADR 0003/0014) |
| **Plafonds KYC (§30)** : plafonds par opération + mensuels sortants selon le palier (0/1/2), appliqués **côté serveur** (`lib/kyc/limits.ts`) ; screening sanctions/PPE = stub local | 🟡 (ADR 0013 ; IDV/screening habilité = bloquant pilote) |
| **Revue KYC admin** (valider / rejeter avec motif / action requise + notif) | ✅ |
| **Confidentialité / RGPD** (`/profile/privacy`, `/api/v1/profile/privacy`) : consentements, export JSON (portabilité), demande de suppression + annulation | ✅ (effacement effectif = procédure manuelle encadrée, ADR 0006) |
| **KESSIA Score** (`lib/score/`, `GET /api/v1/score`, `/profile/score`) : moteur à base de règles, explicable (7 facteurs + malus), conseils priorisés, persisté dans `UserProfile.kessiaScore` | ✅ (ADR 0007 — pas un score de crédit réglementé) |

## Phase 2 — Wallet & Paiements
| Élément | État |
|---|---|
| Ledger (atomique, idempotent) | ✅ · `SELECT … FOR UPDATE` sur toute écriture (anti double-débit concurrent) + `postDoubleEntry` (double entrée atomique tontine ↔ séquestre) — ADR 0031 |
| Wallet : solde, historique, envoyer, **recevoir/QR**, **recharger**, **retirer** | ✅ |
| **Abstraction `PaymentProvider`** (§6.3) | ✅ (4 fournisseurs simulés, ADR 0005) |
| `POST/GET /api/v1/payments` | ✅ |
| **Webhooks fournisseurs** (`POST /api/v1/payments/webhooks/[provider]`) | ✅ HMAC-SHA256, idempotent, PENDING→COMPLETED/FAILED + notif (ADR 0007) |
| **Reversal** sur échec de crédit d'un transfert | ✅ écriture `REVERSAL` (clé `REV-<ref>`), tracée audit |
| **`Idempotency-Key`** entrant (transfer, contribute) | ✅ |
| **Reçus dédiés** : `GET /api/v1/wallet/transactions/[id]` + `/documents/receipt/[txId]` (imprimable / PDF) | ✅ (ADR 0015) |

## Phase 3 — Tontines
| Élément | État |
|---|---|
| Création / détail / cotisation / historique | ✅ |
| **Les 4 types** (§6.4) : Classique Tournante · Projet · Croissance · Achat — visibles dans l'onglet, sélectionnables à la création, mécaniques de distribution distinctes (`lib/tontine/type-meta`). **Achat en 2 formules** : groupée (cagnotte tournante) ou **individuelle** (`PurchaseMode.SOLO` — plan d'achat pour soi, séquestre bloqué jusqu'au dernier versement puis recrédité) | ✅ (ADR 0009, 0035) |
| **Rejoindre par code** (`POST /api/v1/tontine/join {code}`) + modale UI | ✅ |
| **Notifications automatiques** : nouveau membre + cotisation reçue → gestionnaire ; transfert reçu → destinataire ; paiement confirmé/échoué (`lib/notifications/notify`) | ✅ |
| **Cycle automatique** (`lib/tontine/orchestrator`) : démarrage auto/manuel, calendrier, **versement au bénéficiaire quand le tour est complet**, passage de tour / clôture | ✅ (ADR 0009) |
| **Wallet séquestre par tontine §6.5** : chaque tontine a un compte `TONTINE_ESCROW` qui **détient réellement** les cotisations d'un cycle (adossé au ledger, `postDoubleEntry` atomique + `SELECT … FOR UPDATE`) ; garde « jamais de versement > fonds détenus » ; rapprochement `reconcileTontineEscrow` visible `/admin/tontines` + `/admin/analytics` ; ligne « en séquestre » sur le détail membre | ✅ (ADR 0031) |
| **Relances & retards** : `GET/POST /api/v1/cron/tontine-tick` (cotisations `LATE`, relances, rattrapage **+ relances clients échues** §7) + **ordonnanceur** `.github/workflows/cron.yml` (hourly) & `vercel.json` | ✅ (ADR 0014/0015 ; à activer via `CRON_TICK_URL`/`CRON_SECRET`) |
| **Smart Agreement §6.4** : contrat numérique figé au démarrage + acceptation horodatée + `TontineEvent` (journal) · écran `/tontine/[id]/contrat` | ✅ (ADR 0010) |
| **Fonds de Garantie Solidaire §6.5** : règles, projection, demandes, validation conformité, audit, reporting — **mode démonstration** (aucun mouvement réel), `/tontine/garantie` + `/admin/guarantee` | 🟡 structure complète, activation = gate juridique (ADR 0010) |
| Lien Tontine Achat ↔ KESSIA Market | ❌ Market = Phase 8 |

## Phase 4 — Business
| Élément | État |
|---|---|
| Profil entreprise, **produits, ventes, dépenses, factures** | ✅ |
| **Business dashboard** (CA, marge, stock faible, top produits) | ✅ |
| **CRM clients (§7)** : segmentation comportementale, fiche, notes, relances datées, historique, export CSV | ✅ (ADR 0011) |
| **Fournisseurs (§7)** : répertoire, achats cumulés, rattachement aux dépenses | ✅ (ADR 0011) |
| **Devis → facture (§7)** : `kind` `QUOTE`/`INVOICE`, numérotation `DEV-`/`FAC-AAAA-####`, conversion transactionnelle + audit | ✅ (ADR 0011) |
| **Trésorerie & objectifs (§7)** : vues calculées (encaissé/décaissé 6 mois, créances, progression d'objectifs) — jamais stockées comme soldes | ✅ (ADR 0011) |
| **ADN de l'entreprise (§8)** : profil agrégé + score de santé à base de règles + recommandations, `GET /api/v1/business/[id]/dna` | ✅ (ADR 0011) |
| **Devis / factures imprimables** : `GET /api/v1/business/[id]/invoices/[invoiceId]` + `/documents/invoice/…` (A4, `window.print()`) | ✅ (ADR 0015) |
| **Relances clients automatiques** : `lib/reminders/customer-reminders.ts` — notification de l'exploitant à l'échéance (`Customer.followUpNotifiedAt`), via l'ordonnanceur | ✅ (ADR 0015) |
| **Génération PDF côté serveur** (`lib/pdf/mini-pdf.ts`, sans navigateur ni dépendance) : `GET .../invoices/[id]/pdf` + `GET .../transactions/[id]/pdf` (flux `application/pdf`, cookie GET autorisé pour le téléchargement direct) | ✅ (ADR 0032) |
| **Envoi par e-mail** (`lib/email/email.ts`) : `POST .../invoices/[id]/email` — Resend si `RESEND_API_KEY`, sinon SIMULATION journalisée + audit | ✅ (ADR 0032 ; fournisseur réel = clé à fournir) |

## Phase 5 — KESSIA AI
| Élément | État |
|---|---|
| Chat FAQ / onboarding (mode règles) | ✅ |
| **Smart Alerts** (`lib/insights/`, `GET /api/v1/ai/insights`) : recommandations dérivées de données réelles — KYC, échéances, solde bas, 2FA, Business Advisor, Score. Sur accueil + AI | ✅ (ADR 0008) |
| **Assistant contextuel data-aware (§17)** : réponses factuelles sur les données réelles (solde, prochaine cotisation, Score, ventes du mois, plan, opportunités) avant la base de connaissances | ✅ (ADR 0012, `lib/ai/data-answers.ts`) |
| **Opportunity Engine (§17)** : `GET /api/v1/opportunities` — opportunités concrètes tirées des données (devis à relancer, clients dormants, réassort, tontine publique, palier de Score) | ✅ (ADR 0012) |
| **Business Plan AI (§17)** : brouillon de plan d'affaires généré depuis l'ADN, éditable — onglet « Plan » de `/business/[id]`, `GET/PUT/POST /api/v1/business/[id]/plan` | ✅ (ADR 0012) |
| **Voix (§17, §34)** : dictée + lecture des réponses via Web Speech API + **commandes vocales de navigation** (`lib/voice/commands.ts`) | ✅ (ADR 0012/0013) |
| Chat branché sur un LLM (réponses génératives) | ❌ mode règles pour le MVP (dépendance externe) ; la couche data-aware et les garde-fous s'y appliqueront |

## Phase 5+ — Croissance & simulation
| Élément | État |
|---|---|
| **Plan de croissance (§23)** : `/growth` — objectif → action → échéance → indicateur → progression, calculé depuis Score + ADN + tontines + KYC ; `GrowthStepState` persiste la progression | ✅ (ADR 0012) |
| **Simulateurs (§20)** : `/simulator` — épargne/objectif, tontine, activité. Calculs purs, **aucun rendement simulé** | ✅ (ADR 0012) |
| **Agenda (§26)** : `/calendar` — cotisations + factures + échéances de croissance + relances, groupées par jour | ✅ (ADR 0013) |
| **Trust Center (§21)** : `/trust` — tarifs, plafonds KYC + consommation, sécurité, données, mentions réglementaires | ✅ (ADR 0013) |
| **Vision AI (§19)** | ⏭️ Phase 8 — dépendance modèles d'image |

## Phase 6 — Admin
| Élément | État |
|---|---|
| Dashboard (données réelles) + **« Priorités du jour » (Admin Copilot §17)** | ✅ (ADR 0013) |
| **Users / KYC / Transactions / Tontines / Support / Fonds de Garantie / Modules** (écrans + API) | ✅ |
| **Anti-fraude (§32)** : file d'alertes `/admin/fraud` + décision humaine · **signaux comportementaux** (layering, smurfing, nouveau bénéficiaire à montant élevé, accélération, heure creuse) + **déduplication** des alertes ouvertes | ✅ (ADR 0013 / 0033) |
| **Analytics (§28, §54)** : `/admin/analytics` — KPI agrégés (sans nominatif) + série 30 j · **Finance** (revenu FEE, flux net, volumes), **Activation** (activés / actifs 7-30 j / assiduité / entonnoir KYC), **Assistant IA** (usage + origine des réponses) | ✅ (ADR 0013 / 0033) |
| RBAC | ✅ `AdminGuard` (front) + `withAuthAndRole` (API, testé 403) + **middleware edge vérifie le JWT et le rôle pour `/admin/*`** (ADR 0006) |
| **Actions en écriture** : ticket (affecter / statut / répondre / note interne + notif client) via `/admin/support/[id]` ; **modération compte** (suspendre / réactiver — coupe login + révoque sessions) via `/admin/users` | ✅ (ADR 0008) |
| **Pièces jointes de ticket (§46)** : `TicketAttachment` + `GET/POST/DELETE /api/v1/support/[id]/attachments` (bucket privé ou repli data-URI, images/PDF ≤ 5 Mo, internes masquées au demandeur) ; `TicketAttachments` monté côté demandeur et agent | ✅ (ADR 0018) |

## Phase 7 — Beta & Hardening
| Élément | État |
|---|---|
| i18n (§38 — fr + EN/Éwé) | 🟢 infra client + serveur (`serverT()` via cookie) + fallback + interpolation ✅ · **espace membre (dont détail tontine + agenda, ADR 0034) + back-office `/admin/*` + toute la prose serveur traduits FR/EN** (Score, ADN, plan de croissance, opportunités, insights, frais, trésorerie, mentions Trust Center, priorités admin, titres d'événements agenda) ✅ (ADR 0020→0034) · sélecteur de langue hors connexion ✅ · reste hors périmètre : relecture native éwé (finance/légal/KYC) et `/legal/*` (après validation juridique du texte FR) |
| Dark mode (§36) | 🟡 chrome (tokens) ✅ · jetons morts corrigés (ADR 0017) · landing = design mono-thème clair assumé |
| **Onboarding** (splash + carrousel bienvenue, MVP §4) | ✅ `/onboarding` (ADR 0008) |
| **Notifications (§33)** : préférences par catégorie ✅ · **abstraction multi-canal** (`lib/notifications/channels.ts`) — `IN_APP` réel, `PUSH`/`SMS`/`EMAIL` en simulation, journal `NotificationDelivery` ✅ (ADR 0013) · fournisseurs réels ❌ (contrat) |
| Multi-devise | 🟡 `formatCurrency` param devise ; ledger mono-devise |
| PWA installable / offline (§5, §35, §51) | 🟡 manifest + **service worker `v2`** : `/api` jamais en cache, navigations réseau-d'abord (timeout 3,5 s) → coquille de route en cache → `/offline`, 6 coquilles pré-cachées ✅ · **bandeau hors ligne global** (`useOnline` + `OfflineBanner`) + `ErrorNote` offline-aware ✅ · **brouillons de formulaire hors-ligne** (`useFormDraft` + `DraftNotice`) ✅ (ADR 0016 / 0032) · file d'attente offline des mutations = **exclue** (règle MASTER : confirmation serveur) |
| **Anti-fraude (§32)** | ✅ moteur de règles + `Device`/`FraudAlert` + `/admin/fraud` (ADR 0013) — aucun blocage auto, revue humaine |
| **Backups / DR (§48)** | 🟡 script + runbook `docs/operations/backup-recovery.md` (ADR 0013) · rétention/copie hors-hébergeur/test consigné ❌ (infra) |
| Tests des parcours critiques (§49) | 🟡 **38 E2E Playwright** (+ bandeau hors ligne, + PDF/e-mail) · **29 tests d'intégration** base réelle (ADR 0019 + 0029 + 0031 + 0034 : + reversal, tontine Croissance, RBAC `/admin/*`, invariant du séquestre, `postDoubleEntry`, KPI plateforme §54) · **143 unitaires** (+ générateur PDF : intégrité binaire + ouverture `pdf-lib`, + anti-fraude comportemental, + miniatures, + voix EN) · `e2e.yml` + `integration.yml` (Postgres jetable) · **base de test dédiée** requise (ADR 0009) |
| **CI/CD (§50)** | 🟡 `ci.yml` ✅ · `e2e.yml` ✅ · **`integration.yml`** ✅ (ADR 0019) · `staging.yml` (déploiement + `scripts/smoke.mjs`) ✅ (ADR 0013) · `cron.yml` (tick tontine hourly) ✅ (ADR 0014) · staging/production réels ❌ |
| Étape « Sécurité » (PIN) à l'inscription | ❌ 2FA couvre l'intention pour le MVP (ADR 0008) |

## Modules feuille de route (§9–§16)
| Élément | État |
|---|---|
| **Hub « Explorer »** (`/explore`) : modules disponibles en accès direct + modules Phase 8 présentés honnêtement avec « M'intéresser » et note réglementaire | ✅ (ADR 0011) |
| **Captation d'intérêt** : `ModuleInterest`, `/api/v1/modules/interest`, `/admin/modules` (priorisation sur données réelles) | ✅ (ADR 0011) |
| Market §9 · Academy §10 · Communauté §11 · Jobs §12 · Diaspora §15 | ⏭️ Phase 8 (non construits) |
| Invest §13 · Insurance §14 | ⏭️ Phase 8 **+ bloquant réglementaire** — fiche + intérêt uniquement, aucune API/écran |

## Écarts nommés / dette
- ~~`tontine-detail.module.css` référence des tokens inexistants~~ → corrigé (ADR 0017 : `tontine-detail` / `notifications` / `verify-otp` sur jetons valides).
- Hex en dur restant dans les `*.module.css` : volontaire (panneaux de marque sombres, texte blanc sur fond coloré, fond blanc des QR, accent violet IA) ; la landing (`page.module.css`) est un design mono-thème clair assumé.
- Rate limiting : Upstash Redis dès que `UPSTASH_REDIS_REST_URL`/`TOKEN` sont fournis (repli mémoire sinon) — ADR 0014.
- KYC : stockage Supabase Storage (bucket privé + URL signées) dès que configuré, repli data-URI sinon — ADR 0014 ; reste liveness/IDV + screening habilité + nettoyage du bucket à la suppression RGPD.
- Empreinte d'appareil anti-fraude volontairement grossière (en-têtes HTTP) : un signal client léger l'affinerait sans fingerprinting invasif.
- Formulaire de transfert : la validation « solde suffisant » côté client peut utiliser un solde encore en cours de chargement (le contrôle serveur reste la source de vérité).
- `docs/{database,security,operations}/` créés ; `docs/product` = `overview.md` ; **`docs/support/playbook.md` + `docs/user/getting-started.md` rédigés** (ADR 0016).
- Traduction EN/Éwé : **espace membre (dont détail tontine + agenda) + back-office `/admin/*` + TOUTE la prose serveur** (ADR 0020→0034, via `lib/i18n/server.ts` qui lit le cookie `kessia-locale`) — Score, ADN, plan de croissance, opportunités, insights, frais, trésorerie, mentions du Trust Center, priorités admin (`admin.*`, ~230 clés), titres d'événements de l'agenda (`srvCalendar.*`). §38 = 🟢, sans chaîne FR en dur connue. Reste hors périmètre : relecture native éwé (finance/légal/KYC retombe en FR) et `/legal/*` (après validation juridique du texte FR).
