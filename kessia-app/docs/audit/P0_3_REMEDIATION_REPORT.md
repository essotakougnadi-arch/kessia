---
title: "KESSIA — P0.3 : Webhooks sécurisés — Rapport de remédiation"
date: "16 septembre 2026"
---

# KESSIA — P0.3 : Webhooks sécurisés — Rapport de remédiation

**Base** : P0.2 validé (cookies HttpOnly, collision `Session.token` corrigée).
**Périmètre autorisé** (verbatim) : audit de tous les endpoints webhook,
vérification obligatoire des signatures, interdiction du fail-open,
authenticité/intégrité/horodatage, protection anti-rejeu, idempotence
stricte, persistance/suivi des événements, gestion des erreurs/retries,
journalisation/auditabilité, tests. **Hors périmètre, non touché** :
Ledger, Wallet, Payments (règles métier), Tontines, Marketplace (règles
métier), KYC, IA. Aucun workflow `.github/workflows/*.yml` modifié.

---

## 1. Audit — endpoints webhook existants

**2 endpoints, un seul et même défaut** :

| Endpoint | Fournisseur | Fichier |
|---|---|---|
| `POST /api/v1/payments/webhooks/[provider]` | Simulé (mobile-money/bank/qr/cash), ADR 0005 | `app/api/v1/payments/webhooks/[provider]/route.ts` |
| `POST /api/v1/marketplace/deliveries/webhooks/miaride` | Miaride (coursier), ADR 0042 | `app/api/v1/marketplace/deliveries/webhooks/miaride/route.ts` |

**Comportement fail-open confirmé sur les deux** : `if (!secret) return true;` —
la requête est acceptée **sans aucune vérification** si le secret partagé
n'est pas configuré.

**Vérifié avant toute modification** :
- `PAYMENT_WEBHOOK_SECRET`/`MIARIDE_WEBHOOK_SECRET` **ne sont configurés
  nulle part** (ni CI, ni staging, ni local) → le fail-open est **actif en
  permanence**, y compris sur le déploiement réel (démo publique).
- **Aucun test** (unit/intégration/E2E) n'appelait ces routes avant P0.3 —
  confirmé par recherche exhaustive. Aucun code interne ne les appelle non
  plus (recherche dans tout le dépôt, hors fichiers générés).
- L'idempotence **métier** est déjà solide en aval de ces routes
  (`settlePendingPayment` : statut `COMPLETED`/`FAILED` = no-op ; clé ledger
  `PAYTX_<id>` ; garde de statut terminal sur `MarketplaceDelivery`) — **non
  modifiée**.
- Le pattern fail-closed correct existe déjà ailleurs dans le code
  (`app/api/v1/cron/tontine-tick/route.ts::authorized` :
  `if (!secret) return NODE_ENV !== 'production'`) — répliqué ici.

Ces deux constats (zéro test dépendant, zéro appelant interne) ont
directement conditionné le plan minimal : aucun risque de régression sur
l'existant, la seule conséquence du correctif est un **changement de
comportement assumé** sur le déploiement réel (voir §5).

## 2. Correctif

### `lib/webhooks/verify.ts` (nouveau, mutualisé)

Signature au format `t=<horodatage unix>,v1=<HMAC-SHA256 hex de
"${t}.${rawBody}">` — pattern éprouvé (Stripe/GitHub). Un seul mécanisme
couvre à la fois :
- **Authenticité** : HMAC avec le secret partagé.
- **Intégrité** : le HMAC porte sur le corps entier — toute altération
  invalide la signature.
- **Horodatage** : le HMAC porte aussi sur l'horodatage — une signature
  volée ne peut pas être présentée à un autre moment.
- **Anti-rejeu** : fenêtre de tolérance de 5 minutes (paramétrable) ; passé
  ce délai, la même signature valide est rejetée (`timestamp_out_of_range`).

Comportement fail-closed, répliquant exactement le pattern déjà approuvé du
cron : secret absent + `NODE_ENV=production` → rejet (`missing_secret_in_production`) ;
secret absent hors production → accepté mais `verified: false` (convenance
dev/démo locale préservée, comme avant P0.3).

### `WebhookEvent` (nouveau modèle Prisma, migration `20260916090943_p0_3_webhook_events`)

Journal d'**une ligne par requête reçue** (vérifiée ou non, traitée ou
rejetée) : `provider`, `eventType`, `eventKey` (**`@@unique`**, clé de
dédup), `verified`, `status` (`processing`/`processed`/`duplicate`/`rejected`/`failed`),
`rejectReason`, `ipAddress`, `receivedAt`, `processedAt`.

**Idempotence stricte** (`lib/webhooks/journal.ts::recordWebhookAttempt`) :
insertion atomique, contrainte unique en base — deux requêtes concurrentes
pour le même événement ne peuvent jamais passer toutes les deux. Une
tentative précédente `processing` (interrompue, ex. crash serveur) ou
`failed` est **réouverte** (rejeu légitime après un 5xx) ; une tentative
`processed` est un doublon sûr (aucune ré-exécution de la logique métier).
**Couche additionnelle** au-dessus de l'idempotence Ledger existante — ne la
remplace pas.

Clé de dédup :
- Paiement : `payment:<fournisseur>:<event>:<référence>`.
- Miaride : `miaride:<référence>:<statut normalisé>` — une transition réelle
  différente (ex. `IN_TRANSIT` → `DELIVERED`) obtient une clé différente et
  est traitée ; un rejeu exact de la même transition est dédupliqué.

### Gestion des erreurs et retries

- Signature invalide/absente/expirée → **401**, tracé (`recordWebhookRejection`),
  pas de ligne de dédup (pas un événement légitime).
- Échec métier après signature validée (ex. référence introuvable) →
  `WebhookEvent.status = 'failed'` + code HTTP approprié (`404`/`400`) — le
  fournisseur ne doit pas rejouer une erreur définitive.
- Exception inattendue → `500` (comportement inchangé) — signal correct
  pour qu'un fournisseur réel **rejoue** ; une relance ultérieure retrouvera
  la ligne `processing`/`failed` et sera correctement retraitée (pas
  bloquée comme faux doublon).

### Routes mises à jour

`app/api/v1/payments/webhooks/[provider]/route.ts` et
`.../marketplace/deliveries/webhooks/miaride/route.ts` adoptent le module
partagé + le journal. **`settlePendingPayment`, `settleOnDelivery`,
`refundEscrowToBuyer` inchangés** — seule la couche transport (vérification
+ dédup) autour de ces appels a été modifiée.

## 3. Tests

- **Unitaires** (`lib/webhooks/verify.test.ts`, 12 tests) : signature
  valide/absente/malformée/invalide, corps altéré (intégrité), horodatage
  expiré/futur/en limite de fenêtre, tolérance personnalisée, fail-closed
  prod vs accepté-non-vérifié hors prod.
- **Intégration** (`test/integration/webhook-security.itest.ts`, 9 tests,
  base réelle) : pour chaque endpoint — signature absente/invalide/expirée
  → 401 sans effet ; signature valide → 200 + effet métier réel (wallet
  crédité / séquestre libéré) + `WebhookEvent` correctement peuplé ; **rejeu
  du même événement signé → idempotent, aucun double crédit/double
  libération, une seule ligne journal** ; fail-closed en production sans
  secret.
- **E2E** (`e2e/webhook-security.spec.ts`, 8 tests, vrai serveur `next
  start`) : vérifie le comportement **réellement exposé sur le réseau**
  (pas seulement la logique interne) — signature absente/invalide/expirée
  → 401 ; signature valide → passe la couche transport (404 métier sur une
  référence inexistante, distinct d'un 401) ; fournisseur inconnu → 404
  avant même la vérification de signature. Nécessite
  `PAYMENT_WEBHOOK_SECRET`/`MIARIDE_WEBHOOK_SECRET` de test dans l'env du
  serveur E2E — ajoutés dans `playwright.config.ts` (`webServer.env`, pas
  un fichier de workflow CI/CD), valeurs fixes sans rapport avec un secret
  réel, appliquées identiquement en local et en CI.

## 4. Vérification

`tsc` : 0 erreur. `next lint` : 0 warning. `vitest` (unit) : **194/194**
(182 + 12 nouveaux). `test:integration` (`USE_TEST_DB=1`) : **16 fichiers,
62/62** (53 précédents + 9 nouveaux). `build` : OK. `test:e2e:isolated` :
**55/57** (57 = 49 précédents + 8 nouveaux) — **les 8 nouveaux tests
`webhook-security.spec.ts` passent tous**. Les 2 échecs restants
(`marketplace-delivery.spec.ts:14`, `navigation.spec.ts:32` — couleur
d'accent) sont la flakiness pré-existante déjà documentée dans
`TICKET_CI_E2E_FAILURES.md` et le rapport P0.1, non liée à ce travail.

## 5. Changement de comportement assumé (signalé avant implémentation)

Les deux webhooks passent de « accepte tout sans signature » à « refuse
tout sans secret configuré ». **Effet réel sur le déploiement démo/staging** :
tant que `PAYMENT_WEBHOOK_SECRET`/`MIARIDE_WEBHOOK_SECRET` ne sont pas
posés, ces deux endpoints renverront systématiquement 401 à toute requête.
C'est l'objectif recherché (aucun fournisseur réel n'est connecté
aujourd'hui, ADR 0005/0042) et referme une vulnérabilité réellement
exploitable sur l'app déployée (crédit de wallet ou changement de statut de
livraison forgeables sans authentification). Aucune fonctionnalité
utilisateur n'est affectée — ces endpoints ne sont jamais appelés par
l'application elle-même.

## 6. Risques résiduels documentés

1. **Restriction de source (allowlist IP)** — non implémentée, jugée
   disproportionnée sans fournisseur réel connecté (pas de liste d'IP à
   maintenir), et non explicitement demandée dans le périmètre P0.3. La
   signature HMAC est le mécanisme d'authenticité principal et suffisant.
2. **Pas de route de rejeu admin** — le journal `WebhookEvent` permet de
   diagnostiquer un événement `failed`/`rejected`, mais aucune route
   n'automatise son rejeu manuel. Non demandée dans le périmètre de cette
   phase ; le fournisseur réel rejouera naturellement sur un `5xx`/timeout.
3. **Fenêtre anti-rejeu fixe (5 min)** — raisonnable pour un HMAC applicatif
   (large tolérance à la dérive d'horloge/latence réseau), à ajuster si un
   partenaire réel impose une fenêtre différente.
4. **`WebhookEvent` ne persiste pas le corps brut** — choix délibéré (le
   corps peut porter des données à ne pas dupliquer indéfiniment en clair,
   cf. règle « jamais de données sensibles brutes en log », ADR 0007) ; le
   diagnostic s'appuie sur `eventKey`/`rejectReason`/l'audit log existant
   (`recordAudit`), suffisant en pratique.
5. Risques résiduels P0.1/P0.2 inchangés (voir leurs rapports respectifs) —
   non supprimés, non ré-ouverts par ce travail.

## 7. Conformité au périmètre

- ✅ Les 10 points du périmètre autorisé traités : audit, signatures
  obligatoires, fail-open supprimé, authenticité/intégrité/horodatage,
  anti-rejeu, idempotence stricte, persistance/suivi, erreurs/retries,
  journalisation/auditabilité, tests (unit/intégration/E2E).
- ✅ Ledger / Wallet / Payments (règles métier) / Tontines / Marketplace
  (règles métier) / KYC / IA : **non touchés** — seule la couche transport
  webhook (vérification + dédup) a été ajoutée en amont des appels
  métier existants, eux-mêmes inchangés.
- ✅ Aucun workflow `.github/workflows/*.yml` modifié. `playwright.config.ts`
  modifié (pas un fichier de workflow) — nécessité démontrée : sans ces
  variables, aucun test E2E ne peut exercer la vérification de signature
  réussie, seulement le rejet (périmètre explicite : « tests … E2E des
  webhooks »).
- ✅ Risques résiduels P0.0/P0.1/P0.2 non supprimés.
- ✅ 1 changement cohérent = module de vérification + journal + adaptation
  des deux routes + tests, en un seul commit logique.

---

## Verdict

**P0.3 = VALIDÉ — PRÊT POUR P0.4**, sous réserve de la vérification finale
CI/staging documentée dans le commit de clôture.
