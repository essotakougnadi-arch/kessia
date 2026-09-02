# ADR 0008 — Simplicité : actions admin, Smart Alerts, préférences, onboarding

**Statut :** accepté · **Date :** 2026-08-28

## Contexte
Lot Simplicité (dernier de l'ordre §59). Cahier §5 (KESSIA AI : contextuel,
Guide-moi, Business Advisor, Smart Alerts), §7 (« À faire »), §33
(préférences de notification), §45 (back-office : actions en écriture),
MVP §4 (splash + onboarding). MASTER #3 : « aucune donnée financière
inventée ».

## Décisions

### 1. Actions admin en écriture (§45)
- `GET/PATCH /api/v1/admin/support/[id]` (rôles `SUPPORT_ROLES`) :
  `assign` (soi ou `assigneeId`) · `unassign` · `status` (5 statuts,
  pose `resolvedAt`/`closedAt`) · `reply` (`{content, internal?}`) —
  une réponse publique passe le ticket en `WAITING`, s'auto-assigne si
  besoin, et **notifie le demandeur**. Note interne = `isInternal:true`.
- `GET/PATCH /api/v1/admin/users/[id]` (rôles `COMPLIANCE_ROLES`) :
  `suspend` / `reactivate`. La suspension met `isActive:false` (bloque la
  connexion, déjà vérifié au login), **révoque toutes les sessions** et
  notifie. Interdits : modérer son propre compte, modérer un rôle
  privilégié.
- **Fix associé** : `GET /api/v1/support/[id]/messages` filtre désormais
  `isInternal` pour le demandeur (les notes internes ne fuitent pas).
- UI : `/admin/support/[id]` (fil + réponse + note interne + assignation +
  statut) ; `/admin/users` gagne une colonne d'action + modale.

### 2. Smart Alerts / Insights (§5, §7, §22)
- `lib/insights/insights.service.ts::computeInsights(userId)` →
  `Insight[]` **dérivés de données réelles** : KYC à finaliser, cotisation
  due / en retard (avec détection de solde insuffisant), solde bas au
  regard du débit 30 j, 2FA désactivée, Business Advisor (0 vente / semaine
  calme / forte activité), KESSIA Score (haut → félicitation, sinon 1er
  conseil), bienvenue. Trié par priorité, max 6. Déterministe, aucun
  chiffre inventé.
- `GET /api/v1/ai/insights` · `hooks/useInsights`.
- Rendu : section « Pour vous » sur `/home` (remplace l'ancien « À faire »
  ad-hoc, qui ne couvrait que KYC + cotisations) et en tête de `/ai` avant
  la première question.
- **Correction MASTER #3** : la bannière KESSIA Score de `/home` affichait
  « 820 / Excellent » en dur → branchée sur `GET /api/v1/score`. Idem la
  landing (« des milliers d'entrepreneurs » retiré).

### 3. Préférences de notification (§33)
- `UserProfile` : `notifyPayment/Tontine/Business/Support/System/Promotion`
  (SECURITY toujours actif, non configurable). `notify()` / `notifyMany()`
  vérifient la préférence avant d'écrire (défaut = activé si pas de profil).
- Exposées dans `GET/PATCH /api/v1/profile` (`notifications: {...}`).
- Écran `/profile/notifications` (interrupteurs + lien vers le flux).

### 4. Onboarding (MVP §4)
- `/onboarding` : carrousel 4 diapositives (coopérative, tontines, wallet
  fiable, KESSIA AI), « Passer » à tout moment, complétion mémorisée dans
  `localStorage` (`kessia_onboarded`) → un retour va droit à `/register`.
- Les CTA « Commencer » de la landing pointent vers `/onboarding` ;
  `/register` reste accessible directement. Ajouté à `AUTH_ROUTES` du
  middleware (un utilisateur connecté est renvoyé vers `/home`).

## Conséquences
- ✅ Le back-office peut traiter un ticket et modérer un compte de bout en
  bout ; les recommandations sont personnalisées et honnêtes ; l'utilisateur
  contrôle ses notifications ; un nouveau venu est guidé.
- ⏭️ Non fait (hors « MVP durci » ou nécessitant de l'infra) :
  - **Étape PIN à l'inscription** — la 2FA couvre l'intention « étape
    sécurité » pour le MVP ; un PIN transactionnel demande schéma + saisie
    sur chaque action sensible.
  - **Couverture i18n complète** — infra + FR complets, EN partiel ;
    traduction de ~40 écrans à faire.
  - **Dette CSS dark mode** — ~15 `*.module.css` avec des hex en dur
    (landing/auth surtout) ; le chrome basé sur les tokens est OK.
  - **Offline (service worker)** — nécessite une stratégie de cache + tests.
  - **E2E Playwright** — nécessite une base de test dédiée + intégration CI.
  - **Business périphérie** (clients/fournisseurs/devis/export) — extension
    Phase 4.
