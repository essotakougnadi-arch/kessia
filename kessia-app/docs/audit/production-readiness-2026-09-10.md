---
title: "KESSIA — Audit de préparation à la production"
subtitle: "Peut-on ouvrir l'application à de vrais utilisateurs avec de vraies transactions ?"
date: "10 septembre 2026"
---

# KESSIA — Audit de préparation à la production

| | |
|---|---|
| **Date** | 10 septembre 2026 |
| **Version auditée** | commit `a9d6388` (branche `main`) |
| **En ligne** | https://kessia-dun.vercel.app |
| **Pile** | Next.js 14.2.5 · Prisma 5.22 · PostgreSQL (Supabase) · React 18 · Vercel |
| **Méthode** | Revue de code, du schéma de données, de la configuration, de la CI/CD, des scripts d'exploitation et de la documentation. `npm audit`, inspection des en-têtes HTTP, du modèle de session, des flux financiers et des webhooks. |

---

## 1. Résumé exécutif

KESSIA est un **MVP techniquement soigné mais explicitement en mode démonstration**. Le cœur financier — grand livre en partie double, idempotence, verrous de lignes, journal d'audit, droits RGPD, moteur anti-fraude à revue humaine — est **de bonne facture architecturale** et se situe nettement au-dessus de la moyenne des MVP.

En revanche, **aucun vrai utilisateur ne doit effectuer de vraie transaction dans l'état actuel**. Les blocages ne sont pas cosmétiques :

- **Juridique** : pas d'entité, pas de statut réglementaire, pas de licence de service de paiement ni de partenariat agréé. Manipuler l'argent de tiers au Togo est illégal en l'état.
- **Sécurité** : le framework (Next.js 14.2.5) porte **15 vulnérabilités npm dont 2 critiques et 9 hautes**, y compris un **contournement d'autorisation du middleware** et un **RCE non authentifié**. Les jetons de session sont stockés dans `localStorage` et dans un cookie non-`HttpOnly` — exfiltrables par n'importe quel XSS.
- **Sûreté financière** : les webhooks de paiement **acceptent tout trafic non signé si le secret n'est pas configuré** (crédit de wallet forgeable). L'achat marketplace n'est pas idempotent (double débit possible).
- **KYC / LCB-FT** : pas de détection du vivant, screening sanctions/PPE = simulacre local.
- **Exploitation** : schéma géré par `prisma db push` (pas de migrations, pas de rollback), aucun environnement de staging, plan de reprise après sinistre **jamais testé**, secrets sans coffre-fort, aucun monitoring ni alerting branché, pool de connexions base à **15** (saturation quasi certaine sous charge).

**Verdict global : `NOT READY` — score de préparation ≈ 36 / 100.**

Le chemin vers l'ouverture est clair et faisable (voir §4), mais il combine du développement, des démarches juridiques/contractuelles et de la mise en place d'infrastructure de production.

---

## 2. Détail par élément

**Légende** — `READY` : opérationnel pour la production. `PARTIAL` : conçu correctement mais incomplet ou non activé. `NOT READY` : manquant ou inadapté à la production. `CRITICAL` : défaut exploitable ou bloquant qui met en danger les utilisateurs / les fonds / la conformité.

| # | Élément | Statut | Constat |
|---|---------|--------|---------|
| 1 | **Sécurité (générale)** | `CRITICAL` | En-têtes présents (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, CSP). **Manque HSTS.** CSP faible : `script-src 'unsafe-inline' 'unsafe-eval'`. `images.remotePatterns` ouvert à **toute origine https** (`hostname: '**'`). `serverActions.allowedOrigins` codé sur `localhost:3000`. **15 vulns npm** (voir #25). Aucun scan de sécurité en CI, aucun pentest. |
| 2 | **Authentification** | `PARTIAL` | bcrypt, OTP SMS, 2FA TOTP + 8 codes de secours (SHA-256), code PIN local. Lockout 5 tentatives / 15 min, `lockedUntil`, `isActive` vérifiés au login. Access JWT 15 min + refresh 30 j **hashé** + rotation. **Fournisseur SMS = `DEV`** : l'OTP n'est pas un vrai second facteur. `DEMO_MODE` renvoie l'OTP dans la réponse API et affiche des comptes de test — à désactiver en prod. |
| 3 | **Autorisation** | `PARTIAL` | `withAuth` / `withAuthAndRole` / `requireAdmin` sur les routes. Contrôles objet-par-objet présents par endroits (`buyerId !== userId`, anti-auto-modération admin). **`withAuth` ne vérifie que la signature du JWT, pas la table `session`** → révocation / suspension / changement de rôle ne prennent effet qu'à l'expiration du token (15 min). Pas de revue exhaustive IDOR sur toutes les routes. |
| 4 | **RBAC** | `PARTIAL` | Rôles granulaires (`ALL_ADMIN_ROLES`, `COMPLIANCE_ROLES`, `FINANCE_ROLES`, `SUPPORT_ROLES`). Middleware edge `jose` + rôle pour `/admin/*`, doublé par `requireAdmin` côté API (défense en profondeur). **Mais** : la CVE Next.js `GHSA-f82v-jwr5-mffw` permet de contourner le middleware via en-tête — les pages `/admin/*` deviennent accessibles tant que Next n'est pas patché. Rôle dans le JWT (stale 15 min). |
| 5 | **KYC** | `NOT READY` | Flux 3 niveaux, upload pièce + selfie, revue humaine, motifs de rejet, 7 statuts, plafonds appliqués serveur, purge RGPD des pièces. **Pas de détection du vivant** (le selfie = simple photo). **Screening sanctions / PPE = stub local** (`lib/kyc/screening.ts`), ne consulte aucune liste réelle. Plafonds « conservateurs » non calés sur la réglementation BCEAO. Pas de prestataire IDV agréé. Pas de procédure de déclaration de soupçon (CENTIF). |
| 6 | **Protection des données** | `PARTIAL` | RGPD bien avancé : export JSON, demande de suppression annulable, **effacement encadré + purge du bucket + anonymisation** (ADR 0043), rétention automatique. Consentements séparés tracés. Matrice `docs/compliance/matrix.md`. **Chiffrement au repos = hébergeur uniquement**, aucun chiffrement applicatif des champs sensibles ni des pièces KYC en fallback data-URI. **Jetons + infos user dans `localStorage`.** Pas de cartographie sous-traitants / DPA, pas de DPO. |
| 7 | **Wallet** | `PARTIAL` | Solde, historique, dépôt / retrait / transfert, QR, reçus. Toute opération passe par le service ledger ; solde mis à jour dans la **même transaction** que l'écriture. Séquestres dédiés (tontine, marketplace). **Aucun mouvement de fonds réel** (fournisseurs simulés) ; pas de réconciliation avec des relevés partenaires (impossible sans partenaire). |
| 8 | **Ledger / grand livre** | `READY` (avec réserve) | Partie double pour transferts et ventes. `balanceBefore` / `balanceAfter` par ligne. `idempotencyKey` unique + index. Rejet si solde insuffisant. `SELECT … FOR UPDATE` sur les wallets, **verrous ordonnés** (anti-inter-blocage). **Manque** : un job de réconciliation périodique (Σ lignes == solde) et un scellement / clôture comptable. |
| 9 | **Idempotence** | `PARTIAL` | En-tête `Idempotency-Key` sur `wallet/transfer` et `tontine/contribute`. `postDoubleEntry` dérive les jambes `:out` / `:in`. Webhooks idempotents (`PAYTX_<id>`, `MKT_SETTLE_<id>`, `DELIV-<id>`). **`marketplace/[id]/order` utilise `Date.now()` dans la clé** → un rejeu réseau ou un double-clic crée une seconde commande **et un second débit**. Le panier appelle cette route en boucle, sans en-tête d'idempotence. |
| 10 | **Transactions financières** | `PARTIAL` | Atomiques (`prisma.$transaction`), reversal automatique sur échec de crédit (`REV-<ref>`). Types normalisés. **Aucune transaction réelle** (tout `simulated`). Multi-devise « prévu » mais non effectif (XOF uniquement). Le règlement du vendeur pour l'achat par tontine n'est pas automatisé. |
| 11 | **Webhooks** | `CRITICAL` | HMAC-SHA256 + `crypto.timingSafeEqual` sur le corps brut, handlers idempotents et rate-limités. **`if (!secret) return true`** → **si le secret n'est pas configuré en production, le webhook accepte tout, non signé**. Un attaquant forge « paiement confirmé » → crédit de wallet. Contrairement à la route cron, il n'y a **pas** de garde « prod + pas de secret → 401 ». Pas de restriction d'IP source. |
| 12 | **Paiements** | `NOT READY` | Abstraction `lib/payments/` + 4 adaptateurs, **tous simulés**. Aucun contrat opérateur (TMoney, Flooz), aucun environnement sandbox. Pas de conformité PCI-DSS (pas de carte pour l'instant, mais l'enum `CARD` existe). |
| 13 | **Gestion des erreurs** | `PARTIAL` | `logApiError` + try/catch sur ~40 routes, `serverError()` générique, `validationError` (Zod), logs structurés (winston). **`.catch(() => {})` silencieux** à plusieurs endroits (purge rétention, storage d'effacement) — masque des échecs partiels sans alerte. Pas de request-id de corrélation, pas de Sentry/APM. |
| 14 | **Concurrence** | `PARTIAL` | `SELECT … FOR UPDATE` + verrous ordonnés sur les wallets. Clés d'idempotence. **Pas de verrouillage optimiste** (`version`) ailleurs → conditions de course possibles sur l'activation de tontine, la **décrémentation de stock** (faite dans une transaction séparée du débit), l'avancement de round. Le tick cron n'a pas de verrou distribué (double exécution non protégée). |
| 15 | **Fraude** | `PARTIAL` | `lib/fraud/` : empreinte d'appareil non invasive, moteur de règles (`assessFraud`), signaux (vélocité, montant anormal, drain, dormant, nouveau compte + gros montant, échecs login), `FraudAlert` + revue humaine. **Aucun blocage automatique de fonds** (choix assumé). Comportemental uniquement — pas de ML, pas de réputation d'appareil / d'IP externe. Règles d'alerte, pas de règles **bloquantes**. Screening AML = stub (cf. #5). |
| 16 | **Audit logs** | `PARTIAL` | `lib/audit/audit.service.ts`, non bloquant, ne journalise jamais de données sensibles (data-URI KYC exclus). `AuditLog` immuable **applicativement** (aucune API de modification). Instrumenté sur auth, wallet, tontine, KYC, admin, RGPD, cron. Index `userId`, `(entity, entityId)`, `createdAt`. Rétention 5 ans + purge. **Manque** : scellement cryptographique / chaînage de hash, horodatage qualifié, export WORM, séparation des privilèges (un admin base peut altérer la table). |
| 17 | **Sauvegardes** | `PARTIAL` | `scripts/db-backup.mjs` (pg_dump custom, **manuel**). Supabase : PITR + snapshots quotidiens (hébergeur). **Pas de sauvegarde automatisée pilotée par KESSIA, pas de copie hors-hébergeur, rétention 30 j non appliquée.** Le bucket KYC n'est pas dans le périmètre de sauvegarde documenté. |
| 18 | **Restauration** | `NOT READY` | Runbook `docs/operations/backup-recovery.md` avec procédure et RPO/RTO. **Jamais testée** — reconnu comme bloquant (« premier test DR consigné » ⛔). |
| 19 | **Secrets** | `NOT READY` | `.env` / `.env.local` gitignorés, `.env.example` complet, **aucun secret commité** (vérifié). Procédure de rotation documentée. **Pas de gestionnaire de secrets** — tout en variables d'environnement Vercel, en clair, sans rotation automatique ni audit d'accès. `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `DATABASE_URL`, **`SUPABASE_SERVICE_ROLE_KEY` (accès total base)** exposés ainsi. |
| 20 | **Sécurité API** | `PARTIAL` | Validation Zod, auth middleware, rate limiting, versionnement `/api/v1/`. En-têtes de sécurité présents mais CSP faible et pas de HSTS. `/api/metrics` protégé par token. **Pas de politique CORS explicite.** Pas de WAF, pas d'anti-bot sur les endpoints publics (`/marketplace`, `/discover`). Pas de plafond global de taille de payload. Cookie d'auth non `HttpOnly`. |
| 21 | **Rate limiting** | `PARTIAL` | `lib/security/rate-limit.ts` : Upstash Redis (sliding window) si configuré, **sinon repli mémoire**. **Le repli mémoire est inopérant en serverless** (compteur par instance → limite × N). Limites par route raisonnables. `E2E_RATE_LIMIT_BYPASS` bien gardé. Pas de rate limit edge / par IP global. |
| 22 | **Validation des données** | `READY` (réserve mineure) | Zod + `safeParse` + `validationError` sur les routes. Types stricts, enums, bornes (montants, longueurs). Images : regex data-URI + taille. Réserve : quelques `parseInt` de query params non validés (pagination) ; chaînes libres non sanitisées au-delà du trim (acceptable : React échappe, Prisma paramètre). |
| 23 | **Uploads** | `PARTIAL` | KYC : data-URI (~2,5 Mo) ou bucket privé + URL signées 5 min, MIME whitelisté. Pièces jointes ticket : MIME whitelist, 10 max/ticket, 5 Mo. Images marketplace : regex jpeg/png/webp, 2,7 Mo. **Pas d'analyse antivirus. Pas de ré-encodage serveur** (strip EXIF, normalisation) → risque polyglotte / métadonnées. Le fallback data-URI stocke les binaires **en base**. |
| 24 | **Injections** | `READY` | Prisma ORM (requêtes paramétrées). Unique requête brute : `$queryRaw` en template balisé paramétré, sûr. `dangerouslySetInnerHTML` seulement pour les scripts d'init thème/accent (constantes). Pas d'`eval`, pas de `child_process` avec entrée utilisateur. Réserve : la CSP `unsafe-inline` réduit la défense contre un XSS résiduel. |
| 25 | **Dépendances vulnérables** | `CRITICAL` | **`npm audit` : 15 vulnérabilités (2 critiques, 9 hautes, 4 modérées)** ; 3 en dépendances de production. **Next.js 14.2.5** : `GHSA-f82v-jwr5-mffw` **contournement d'autorisation du middleware**, `GHSA-p293-qw3h-jr36` **RCE non authentifié (Windows)**, `GHSA-2xp9-vwfh-vxw4` **RCE via optimisation d'image AVIF**, multiples SSRF / cache poisoning / DoS. `postcss` (haute), `uuid` (modérée) en prod. **Aucun scan en CI, pas de Dependabot / Renovate / Snyk.** |
| 26 | **Sessions / tokens** | `CRITICAL` | Access JWT 15 min, refresh 30 j **hashé** en base, rotation implémentée. Session en table, révocation à la déconnexion / changement de mot de passe / suspension. **MAIS : access token + refresh token + infos user dans `localStorage`** (`kessia-auth`), cookie `kessia-access-token` **non `HttpOnly`** (posé via `document.cookie`) → **tout XSS = prise de contrôle du compte**. `withAuth` ne consulte pas la table `session` → jeton volé valable 15 min après révocation. Pas de détection de réutilisation de refresh token, pas de liaison appareil/IP. |
| 27 | **Logs** | `PARTIAL` | winston structuré, `logApiError` sur ~40 routes, données sensibles exclues. **Pas d'agrégation centralisée** — les logs Vercel Hobby ont une rétention de quelques jours. Pas de request-id / trace-id. Logs `console` résiduels (`[NOTIFY:PUSH] (simulation)`). Rétention des logs applicatifs (matrice §9 : « 6-12 mois ») non implémentée. |
| 28 | **Monitoring** | `NOT READY` | `/api/health` (ping base), `/api/metrics` (Prometheus, token). **Aucun collecteur branché.** Pas d'APM (traces, latence par route, taux d'erreur). Pas de suivi temps réel des métriques métier (volume transactions, échecs paiement, solde des séquestres). |
| 29 | **Alerting** | `NOT READY` | **Aucune alerte configurée** (ni PagerDuty, ni Opsgenie, ni webhook Slack ops). Les « priorités du jour » admin sont in-app, consultées manuellement. Rien n'alerte sur : 5xx, latence base, pool saturé, échec du cron, incohérence de séquestre, pic de fraude. |
| 30 | **Performance** | `PARTIAL` | SWR (cache client), RSC, First Load JS partagé 87,5 ko (correct). **Pool de connexions Supabase = 15** — très bas, a déjà causé des échecs aléatoires en test intensif ; saturation quasi certaine sous charge serverless. Aucun test de charge. Pas de cache serveur (Redis) pour les endpoints publics. Images data-URI non cacheables. Région unique loin de l'Afrique de l'Ouest. |
| 31 | **Index de base de données** | `PARTIAL` | 68 directives `@@index` / `@unique` — couverture correcte des accès fréquents (User phone/email, Session token, LedgerEntry walletId/status/idempotencyKey, AuditLog, Notification, MarketplaceItem). **Potentiellement manquants** : `LedgerEntry.referenceId`, composite `(walletId, createdAt)` pour l'historique paginé, index GIN sur `MarketplaceDelivery.extraOrderIds` (recherche `has` = scan), `TontineContribution (tontineId, round, status)`. Aucun `EXPLAIN ANALYZE` réalisé. |
| 32 | **Migrations** | `NOT READY` | **Aucun dossier `prisma/migrations/`.** Le projet utilise **`prisma db push`** partout (CI, scripts, base de démo/prod). `db push` = pas d'historique, pas de fichiers revus, **pas de rollback**, application en direct des changements de schéma → risque de perte de données silencieuse et de verrous longs sur une vraie base. Le script `db:migrate` existe mais est `migrate dev` (développement uniquement). |
| 33 | **Tests** | `PARTIAL` | **182 tests unitaires** + **13 suites d'intégration** (vraie base : ledger, idempotence, webhooks, plafonds KYC, cycle tontine, séquestre, RGPD) + **16 suites E2E** Playwright. CI exécute unit + build + typecheck + lint. **Manque** : couverture mesurée, tests de charge, **tests de sécurité** (SAST, DAST, fuzzing, autorisation exhaustive), tests d'invariants comptables à grande échelle. |
| 34 | **CI / CD** | `PARTIAL` | GitHub Actions : `ci.yml`, `integration.yml`, `e2e.yml`, `cron.yml`. **Pas d'étape de sécurité** (`npm audit`, scan dépendances / secrets, SAST). **Déploiement = Vercel auto sur push `main`** : pas de barrière, pas d'approbation, **pas de smoke test bloquant avant bascule du trafic**, pas de blue/green ni canary. Pas de versioning / release notes. |
| 35 | **Staging** | `NOT READY` | **Aucun environnement de staging réel.** L'URL « démo » est de fait la production, **sur la même base Supabase** que le développement et les tests. Impossible de valider un changement contre des données isolées avant prod. `staging.yml` = squelette désactivé (secrets absents). |
| 36 | **Configuration de production** | `PARTIAL` | `.env.example` complet. **Vercel Hobby** (cron quotidien seulement, timeouts, pas de WAF). **Région unique** `eu-west-1`. Beaucoup de fonctions « à activer par variable d'env » non activées (Upstash, secrets webhook, APM, SMS/push/email, ordonnanceur). `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` exposent des comptes de test et l'OTP. `serverActions.allowedOrigins` = localhost. `images.remotePatterns` ouvert. |
| 37 | **Disaster recovery** | `NOT READY` | Runbook avec RPO/RTO et procédures d'incident. **DR jamais exécuté ni consigné.** Point de défaillance unique : une base, une région, aucune bascule. Pas de copie hors-hébergeur. Dépendance totale à Vercel + Supabase sans plan de sortie. |

### Récapitulatif des statuts

| Statut | Nombre | Éléments |
|--------|--------|----------|
| `CRITICAL` | 4 | Sécurité générale · Webhooks · Dépendances vulnérables · Sessions/tokens |
| `NOT READY` | 10 | KYC · Paiements · Restauration · Secrets · Monitoring · Alerting · Migrations · Staging · Disaster recovery · *(+ Sécurité générale, comptée en CRITICAL)* |
| `PARTIAL` | 21 | Authentification · Autorisation · RBAC · Protection des données · Wallet · Idempotence · Transactions financières · Gestion des erreurs · Concurrence · Fraude · Audit logs · Sauvegardes · Sécurité API · Rate limiting · Uploads · Logs · Performance · Index BDD · Tests · CI/CD · Config prod |
| `READY` | 3 | Ledger (avec réserve) · Validation des données · Injections |

---

## 3. Scores de préparation

Note sur 100. Un service financier réel exige typiquement ≥ 80 sur Security, Financial Safety et Compliance avant d'ouvrir.

| Catégorie | Score | Justification courte |
|-----------|:-----:|----------------------|
| **SECURITY** | **32** | Bonnes bases (en-têtes, RBAC en couches, audit, 2FA, bcrypt) mais jetons dans `localStorage` / cookie non-`HttpOnly`, CVE critiques Next.js (dont contournement du middleware), webhooks fail-open, CSP faible, pas de coffre-fort de secrets, aucun scan ni pentest. |
| **RELIABILITY** | **38** | Ledger atomique + idempotence + reversal + verrous = solide au cœur. Plombé par : pool base à 15, aucun monitoring / alerting, DR non testé, pas de staging, `.catch(()=>{})` silencieux, concurrence partiellement gérée. |
| **FINANCIAL SAFETY** | **45** | La comptabilité est la meilleure partie du projet (partie double, `FOR UPDATE`, idempotence, séquestres, anti-fraude à revue humaine, audit). Freins : idempotence trouée sur l'achat marketplace, webhooks fail-open (crédit forgeable), pas de réconciliation, aucun rail réel donc rien de prouvé en conditions réelles, KYC / LCB-FT non opérationnel. |
| **PERFORMANCE** | **40** | Bundle correct, SWR, RSC. Pool 15, pas de cache serveur, aucun test de charge, images data-URI non cacheables, région unique éloignée des utilisateurs. |
| **SCALABILITY** | **25** | Front serverless OK, mais base à 15 connexions, rate-limit mémoire inopérant en multi-instance, pas de cache, pas de file d'attente (tout synchrone ou dans un tick), région unique, `db push` empêche l'évolution sûre du schéma sous charge. |
| **TESTING** | **55** | 182 unitaires + 13 intégration + 16 E2E + CI — bien au-dessus de la moyenne des MVP. Manque : couverture mesurée, tests de sécurité, tests de charge, tests d'autorisation exhaustifs. |
| **DEVOPS** | **30** | CI de qualité (lint / type / test / build) mais pas de staging, pas de gate avant prod, pas de scan de sécu, pas de coffre-fort, monitoring / alerting non branchés, `db push` au lieu de migrations, DR non testé. |
| **UX** | **78** | Point fort. Parcours complets, i18n FR / EN (+ éwé partiel), PWA, design cohérent aligné sur les maquettes, mode hors-ligne, messages d'erreur clairs. Réserves : éwé partiel, dépendance à `localStorage` pour la session (risque). |
| **COMPLIANCE READINESS** | **20** | Matrice de conformité honnête, RGPD bien avancé (export / effacement / rétention), CGU en brouillon, Trust Center. Mais : **pas d'entité juridique, pas de statut réglementaire, pas de licence / partenariat agréé, KYC sans liveness ni screening réel, pas de DPO, pas de DPA sous-traitants, plafonds non calés BCEAO, valeur probante des logs non établie.** |

### Score global

Pondération pour un service financier : Financial Safety 20 % · Security 20 % · Compliance 20 % · Reliability 15 % · DevOps 10 % · Testing 5 % · Scalability 5 % · Performance 3 % · UX 2 %.

**Score global de préparation ≈ 36 / 100 — `NOT READY`.**

> Interprétation : le produit est une **excellente base de démonstration et de pilote fermé** (équipe interne, données fictives). Il n'est pas prêt pour de vrais utilisateurs manipulant de vrais fonds. L'écart n'est pas un problème de qualité du code métier — il est là — mais d'infrastructure de production, de durcissement sécurité, et de prérequis réglementaires.

---

## 4. Les 20 actions prioritaires

Ordre : risque × caractère bloquant. Les cinq premières sont non négociables avant toute ouverture.

| # | Action | Domaine | Qui |
|---|--------|---------|-----|
| 1 | **Constituer l'entité juridique et obtenir le statut réglementaire** (établissement de paiement / monnaie électronique, ou partenariat avec un agréé) + partenariats bancaires — Togo puis UEMOA. Aucune vraie transaction n'est légale sans ça. | Compliance | Direction / conseil juridique |
| 2 | **Mettre à jour Next.js** (≥ 14.2.35, idéalement dernière 14.2.x ou 15.x) et **corriger les 15 vulnérabilités npm** ; ajouter `npm audit --audit-level=high` **bloquant** en CI + Dependabot/Renovate. Corrige le contournement d'autorisation du middleware et les RCE. | Sécurité | Dév |
| 3 | **Sortir les jetons de `localStorage`** : session par cookie **`HttpOnly` + `Secure` + `SameSite=Strict`** posé **côté serveur**, access token jamais exposé au JS. Durcir la CSP (retirer `unsafe-inline` / `unsafe-eval`, passer aux nonces). Adapter la navigation SSR. | Sécurité | Dév |
| 4 | **Webhooks : refuser en production si le secret n'est pas configuré** (comme le cron), restreindre les IP sources, et **poser réellement** `PAYMENT_WEBHOOK_SECRET` / `MIARIDE_WEBHOOK_SECRET`. Sans ça, n'importe qui peut créditer un wallet. | Sûreté financière | Dév |
| 5 | **Intégrer un prestataire IDV agréé** (détection du vivant) + un **screening sanctions / PPE habilité** (ONU / UE / OFAC). Caler les plafonds KYC sur la réglementation BCEAO. Définir la procédure de déclaration de soupçon (CENTIF). | KYC / LCB-FT | Dév + conformité + prestataire |
| 6 | **Rendre l'achat marketplace idempotent** : clé stable côté client + support `Idempotency-Key` sur `POST /marketplace/[id]/order` et dans la boucle du panier. Fusionner la décrémentation de stock dans la transaction de débit. | Sûreté financière | Dév |
| 7 | **Passer de `prisma db push` à `prisma migrate`** : migration initiale, `prisma/migrations/` versionné, `migrate deploy` en CI/CD, interdiction de `db push` sur prod. | DevOps | Dév |
| 8 | **Créer un vrai environnement de staging** (projet Vercel + base Supabase dédiés) et une **passerelle de déploiement** : push `main` → staging → smoke tests **bloquants** → promotion manuelle vers prod. | DevOps | Dév / ops |
| 9 | **Mettre en place un gestionnaire de secrets** (Doppler / Vault / AWS Secrets Manager). Retirer `SUPABASE_SERVICE_ROLE_KEY` de l'app si possible (RLS + clés restreintes). Planifier la rotation des secrets JWT / webhook. | Secrets | Dév / ops |
| 10 | **Régler le pooling PostgreSQL** : PgBouncer / pool Supabase dimensionné bien au-delà de 15, `connection_limit` Prisma adapté au serverless, surveillance de la saturation. Sans ça, l'app tombe sous quelques dizaines d'utilisateurs concurrents. | Reliability / Scalability | Dév / ops |
| 11 | **Configurer Upstash Redis en production** (le repli mémoire est inopérant en serverless) + rate limiting / WAF au niveau **edge** (Vercel Firewall ou Cloudflare) sur l'auth et les endpoints publics. | Rate limiting | Ops |
| 12 | **Brancher un APM** (Sentry + traces, ou Datadog) : 5xx par route, latence, erreurs corrélées par request-id, métriques métier (transactions, échecs de paiement, solde des séquestres). | Monitoring | Ops |
| 13 | **Définir l'astreinte et les alertes** : 5xx > seuil, latence base, échec du cron horaire, pool saturé, incohérence de séquestre, pic de `FraudAlert`, webhooks rejetés en masse. Runbook d'incident opérationnel. | Alerting | Ops |
| 14 | **Exécuter et consigner un test de restauration complet** (base + bucket KYC) sur un environnement neuf ; mettre en place une **copie de sauvegarde chiffrée hors-hébergeur**, rétention 30 j vérifiée ; documenter le RTO réel mesuré. | Backups / DR | Ops |
| 15 | **Vérifier la session en base** (pas seulement le JWT) sur les opérations sensibles (transferts, retraits, actions admin, changement de sécurité) → révocation / suspension / rétrogradation effectives immédiatement. Ajouter la détection de réutilisation de refresh token. | Autorisation / Sessions | Dév |
| 16 | **Job de réconciliation comptable** périodique : pour chaque wallet, Σ(lignes ledger) == solde ; pour chaque séquestre, détenu == attendu ; alerte sur divergence. Envisager une clôture / scellement quotidien du journal d'audit. | Sûreté financière | Dév |
| 17 | **Chiffrement applicatif des données personnelles sensibles** au repos (migrer entièrement les pièces KYC vers le bucket privé, abandonner le fallback data-URI). Cartographier les sous-traitants + DPA, désigner un DPO, formaliser le registre des traitements et les transferts hors zone. | Protection des données | Dév + conformité |
| 18 | **Uploads** : analyse antivirus (ClamAV / service) + **ré-encodage serveur** des images (strip EXIF, normalisation), plafond du nombre d'uploads KYC par période, refus de tout ce qui n'est pas image bitmap. | Uploads | Dév |
| 19 | **Pentest externe** (auth, autorisation objet-par-objet / IDOR sur toutes les routes `/api/v1/*`, logique métier transferts / tontines / séquestres, webhooks) et correction des findings avant ouverture. Ajouter des **tests d'autorisation automatisés** (A ≠ ressources de B) à la suite E2E. | Sécurité / Tests | Prestataire + Dév |
| 20 | **Durcir la configuration de production** : désactiver `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE`, ajouter `Strict-Transport-Security`, restreindre `images.remotePatterns` aux hôtes réellement utilisés, corriger `serverActions.allowedOrigins` (domaine de prod), brancher les fournisseurs SMS / push / email réels, passer à un plan Vercel Pro, documenter un plan de sortie Vercel / Supabase. | Config prod | Dév / ops |

---

## 5. Ce qui est déjà solide (à conserver)

- **Grand livre en partie double** avec `balanceBefore` / `balanceAfter`, verrous de lignes ordonnés, idempotence par clé, reversal automatique.
- **Séquestres dédiés** (par tontine, plateforme marketplace) avec libération / remboursement idempotents.
- **RGPD** : export, effacement encadré + purge du bucket + anonymisation, rétention automatique — au-dessus de la moyenne.
- **Journal d'audit** immuable applicativement, instrumenté largement, données sensibles exclues.
- **Anti-fraude** à base de règles + revue humaine, sans blocage automatique de fonds.
- **RBAC en couches** (middleware edge + `requireAdmin` côté API).
- **2FA TOTP** + codes de secours, lockout anti-brute-force, rotation des refresh tokens hashés.
- **En-têtes de sécurité** de base présents, **aucun secret commité**.
- **Suite de tests** conséquente (182 unit + 13 intégration + 16 E2E) avec CI.
- **UX** aboutie et cohérente.

---

*Document généré le 10 septembre 2026 à partir d'une revue du dépôt `essotakougnadi-arch/kessia` au commit `a9d6388`. Source Markdown : `kessia-app/docs/audit/production-readiness-2026-09-10.md`.*
