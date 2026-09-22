---
title: "KESSIA — P0.3 : Sécurisation des webhooks externes — Rapport"
date: "22 septembre 2026"
---

# KESSIA — P0.3 : Sécurisation des webhooks externes

**Base** : P0.0, P0.1, P0.2, P1.7, P1.9, P1.12 déjà validés — non refaits.

**Verdict : `PASS`.**

## 1. Inventaire des webhooks (audit exhaustif, Étape 1)

Recherche exhaustive (`webhook`/`callback`/`HMAC`/`signature` sur
`app/api/**`, `lib/**`) : **exactement 2 endpoints webhook** dans tout
le dépôt. Aucun `pages/api` (App Router pur). Aucun callback KYC —
confirmé : `lib/kyc/screening.ts` (stub) n'est câblé nulle part (constat
déjà documenté en P0.5), donc aucun webhook KYC n'existe à sécuriser.

| Webhook | Fournisseur | Auth | Secret | Signature | Replay | Idempotence | Audit | État avant ce chantier |
|---|---|---|---|---|---|---|---|---|
| `POST /api/v1/payments/webhooks/[provider]` | mobile-money/bank/qr/cash/simulator (simulés, ADR 0005) | HMAC-SHA256 corps brut + horodatage | `PAYMENT_WEBHOOK_SECRET` — absent sur Staging/Prod (vérifié `vercel env ls`) | `x-kessia-signature: t=<ts>,v1=<hmac>` | fenêtre 5 min | `WebhookEvent.eventKey` (transport) + `PAYTX_<id>` (Ledger, métier) | `recordAudit`, aucun secret loggé | Solide ; 0 test de concurrence |
| `POST /api/v1/marketplace/deliveries/webhooks/miaride` | Miaride (aucun partenariat réel connecté) | idem | `MIARIDE_WEBHOOK_SECRET` — absent | `x-miaride-signature`, même format | idem | `WebhookEvent.eventKey` + garde de statut terminal | idem | Solide ; signature-absente/secret-absent/concurrence non testés |

## 2. Fournisseur

Aucun fournisseur réel n'est aujourd'hui connecté (ADR 0005 : MVP avec
fournisseurs de paiement simulés ; Miaride sans partenariat réel actif).
Les deux endpoints sont l'interface réelle, prête à recevoir un vrai
fournisseur dès que son secret sera configuré.

## 3. Méthode d'authentification

HMAC-SHA256 sur le corps brut (`request.text()`, **avant** tout
`JSON.parse`) concaténé à l'horodatage (`t=<ts>,v1=<hmac_hex>`),
comparaison en temps constant (`crypto.timingSafeEqual`). Pattern
identique pour les deux webhooks (`lib/webhooks/verify.ts`, partagé,
non modifié dans ce chantier — déjà conforme).

## 4. Problème initial / fail-open identifié

**Aucun fail-open trouvé sur le chemin réellement atteignable.**
`verifyWebhookSignature` refuse (401) si le secret est absent ET
`NODE_ENV === 'production'` — et **tout build Vercel** (Staging comme
Production) tourne avec `NODE_ENV=production` (comportement Next.js
standard, déjà documenté dans ce dépôt). Confirmé en direct : les deux
secrets sont absents sur `kessia-staging` et les deux endpoints
répondent **401** à toute requête, signée ou non. Le repli « accepté,
non vérifié » ne s'active que hors production (dev local / tests), donc
jamais sur un déploiement réellement exposé.

**Problème réel trouvé, à un autre niveau** — voir §7 (concurrence).

## 5. Correction

Aucune correction sur la vérification de signature elle-même (déjà
conforme). Correction unique sur l'idempotence sous concurrence — voir
§7.

## 6. Anti-rejeu

Déjà en place, non modifié : fenêtre de tolérance de 5 minutes sur
l'horodatage signé (`toleranceMs = 5*60_000`), documentée dans le code.
Testé : événement dans la fenêtre → accepté ; hors fenêtre → 401.
Aucun `nonce`/`event ID` propre au fournisseur n'existe (fournisseurs
simulés) — le mécanisme d'idempotence KESSIA (`WebhookEvent.eventKey`)
sert de protection anti-rejeu complémentaire, conformément à la
consigne du mandat de ne pas inventer un protocole fournisseur.

## 7. Idempotence — problème trouvé et corrigé

### Le problème (trouvé en écrivant le test de concurrence exigé, Étape 8)

`recordWebhookAttempt` (`lib/webhooks/journal.ts`) insère une ligne
`WebhookEvent` avec `eventKey @unique` — l'insertion elle-même est
atomique (contrainte Postgres). Mais le traitement du **conflit**
(`P2002`, 19 des 20 appels concurrents identiques) rouvrait la ligne
**sans condition** dès que son statut était `processing` ou `failed` —
sans distinguer « un concurrent la traite EN CE MOMENT » (statut
`processing` récent, cas normal sous vraie concurrence) de « le
traitement précédent a crashé » (statut `processing` ancien, cas de
reprise légitime). **Constaté empiriquement** (pas supposé) : sous 20
requêtes vraiment concurrentes du même événement, **7 appels sur 20**
recevaient `duplicate: false` et déclenchaient TOUS la logique métier en
parallèle.

**Aucun risque financier** — vérifié explicitement : la contrainte
`LedgerEntry.idempotencyKey @unique` a absorbé le risque (une seule
écriture réellement créée, solde correct dans 100 % des runs). Le
problème réel : les appels « perdants » de la course au niveau Ledger
recevaient une erreur Prisma **brute** (`"Unique constraint failed on
the fields: (idempotencyKey)"`) renvoyée en HTTP 400 au lieu d'une
réponse idempotente propre — à la fois non conforme à l'Étape 9 du
mandat (« événement déjà traité → réponse idempotente appropriée ») et
une fuite mineure de détail interne (Étape 9 : « ne pas exposer... SQL »).

### Correction (`lib/webhooks/journal.ts` uniquement — Ledger non touché)

- Statut `processing` **récent** (< 60 s) : un concurrent le traite
  très probablement en ce moment → `duplicate: true` immédiatement,
  **aucune écriture tentée**.
- Statut `processing` **ancien** (≥ 60 s, crash serveur probable) ou
  `failed` : réclamation **atomique conditionnelle** (`updateMany` avec
  la valeur courante en `WHERE`, réévaluée par Postgres au moment de
  l'écriture via verrouillage de ligne — même mécanisme que le
  compare-and-swap déjà appliqué à P0.2 pour `rotateRefreshToken`) : un
  seul appelant concurrent peut gagner la réclamation.

Aucune modification du Ledger, de `settlePendingPayment`, ni d'aucune
logique métier Payments/Marketplace.

## 8. Concurrence (Étape 8 — preuve)

| Test | Résultat |
|---|---|
| 20 requêtes concurrentes, **même** événement paiement | ✅ 1 seul traitement effectif, 19×`duplicate:true`, 0×500, solde correct |
| 20 événements **différents** concurrents (paiement) | ✅ chacun traité une fois, aucune contamination croisée |
| 20 requêtes concurrentes, **même** événement Miaride | ✅ 1 seule libération de séquestre, 0×500 |
| 20 livraisons **différentes** concurrentes (Miaride) | ✅ chacune traitée une fois, aucune contamination croisée |

Rejoué 5× consécutivement après correctif : stable, 17/17 à chaque run.

## 9. Validation du payload

Chaque webhook valide via un schéma Zod strict (`eventSchema`) : type
d'événement (`enum`), référence obligatoire, statut mappé via une liste
blanche (`EXTERNAL_STATUS` pour Miaride — un statut inconnu → 400).
**Le montant n'est jamais lu du webhook** : `settlePendingPayment` lit
`Number(tx.amount)` depuis la `PaymentTransaction` déjà créée en
interne — le webhook ne peut communiquer qu'un `event`/`reference`, pas
un montant arbitraire. Confirmé : aucun champ `amount`/`currency` dans
`eventSchema` du webhook paiement. Le webhook est traité comme un
signal externe à vérifier, jamais comme une autorité sur le Ledger —
conforme à l'Étape 7.

## 10. Audit / logging

`recordAudit`/`recordWebhookRejection` déjà en place (provider, type
d'événement, raison de rejet générique — jamais de secret, signature
complète, ni payload financier brut). Vérifié en direct sur Staging :
`vercel logs` sur toute la session de validation → aucune occurrence de
secret, aucune trace `500`.

## 11. Tests

`test/integration/webhook-security.itest.ts` : **9 → 17 tests**.
Ajoutés : payload altéré (paiement + Miaride), signature absente
(Miaride), secret absent en production (Miaride), 4 tests de
concurrence (20× même événement / 20× événements différents, pour
chaque webhook). Matrice complète des 12 points de l'Étape 11 :
signature valide/invalide/absente ✅, secret absent ✅, payload
modifié ✅, événement ancien ✅, replay ✅, double réception ✅,
concurrence même événement ✅, concurrence événements différents ✅,
aucun double effet métier ✅ (vérifié sur les soldes réels), aucun
secret dans les logs ✅ (vérifié en direct sur Staging).

### Vérification complète
`tsc` 0 erreur · `lint` 0 warning · unit **225/225** (inchangé) ·
intégration **18 fichiers, 86/86** · build OK · E2E isolé **55
passed / 2 failed** (`auth.spec.ts:12` flaky déjà caractérisé en P0.5,
`marketplace-delivery.spec.ts:14` préexistant documenté — aucun lien
avec les webhooks).

## 12. Staging

Déployé sur **`kessia-staging` exclusivement** (Vercel CLI depuis la
racine du dépôt, hors pipeline Git, aucun push). **Aucun fournisseur
réel connecté** (confirmé : ni `PAYMENT_WEBHOOK_SECRET` ni
`MIARIDE_WEBHOOK_SECRET` configurés) — conformément à l'Étape 12,
**pas de faux PASS simulé** : ce qui est réellement vérifiable sans
secret (le fail-closed) l'a été en direct ; ce qui nécessite un secret
(signature valide → traitement) a été vérifié en local avec des
fixtures de test, pas sur Staging.

| Vérification | Résultat |
|---|---|
| Webhook paiement, sans signature | ✅ 401 (en direct) |
| Webhook paiement, signature bidon | ✅ 401 (en direct) |
| Webhook Miaride, sans signature | ✅ 401 (en direct) |
| Webhook Miaride, signature bidon | ✅ 401 (en direct) |
| Fournisseur paiement inconnu | ✅ 404 |
| Logs Vercel | ✅ aucun `500`, aucun secret |
| P0.2 (login/wallet/logout) | ✅ 200/200/200, wallet après logout → 401 |
| P1.12 (Upstash) | ✅ actif, 429 avec délai réel calculé ("142 secondes"), non modifié |

**Ce qui nécessitera un test avec un fournisseur réel** : la
vérification de signature valide → traitement effectif n'est
validée aujourd'hui que par les fixtures de test locales
(`signWebhookPayload`, secret de test) — dès qu'un vrai secret
fournisseur sera configuré sur Staging/Production, un test de bout en
bout avec ce secret réel devra être rejoué avant d'activer le
fournisseur en production.

## 13. Limitations éventuelles

- Le webhook Miaride ne fournit ni `nonce` ni `event ID` propre — la
  protection anti-rejeu repose entièrement sur la fenêtre horodatée +
  l'idempotence KESSIA, pas sur un mécanisme natif du fournisseur
  (aucun protocole Miaride réel n'existe encore à respecter, ADR 0005).
- Le seuil de 60 s pour distinguer « crash serveur » de « concurrence
  réelle » est un choix pragmatique, documenté dans le code — un
  fournisseur réel avec des délais de traitement très longs (> 60 s)
  pourrait voir un rejeu légitime retardé traité comme faux-doublon
  transitoire (`duplicate: true`) puis correctement réclamé au rejeu
  suivant du fournisseur (comportement sûr par défaut : jamais de double
  effet, au pire un rejeu supplémentaire nécessaire).

## 14. Risques résiduels

Aucun nouveau risque introduit. Les 2 webhooks restent fail-closed en
production tant qu'aucun secret n'est configuré — état volontaire
(ADR 0005), pas un défaut.

## 15. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `lib/webhooks/journal.ts` | `recordWebhookAttempt` : réclamation atomique conditionnelle au lieu d'une réouverture inconditionnelle |
| `test/integration/webhook-security.itest.ts` | 9 → 17 tests (concurrence, payload altéré, Miaride signature-absente/secret-absent) |

Aucun autre fichier touché — confirmé par `git diff --stat`. Ledger,
Wallet, Escrow, Payments (logique métier), Tontines, Marketplace
(métier), KYC, AI, RBAC, Sessions/Tokens (P0.2), rate limiting (P1.12),
migrations Prisma : **non touchés**.

## 16. Commit

Un seul commit local, périmètre strictement limité aux 2 fichiers
ci-dessus + ce rapport + `CHANGELOG.md`. **Non poussé vers
`origin/main`.**

## 17. Verdict

**VERDICT P0.3 : `PASS`.**

Les 2 webhooks externes de KESSIA sont authentifiés cryptographiquement
(HMAC + horodatage, comparaison temps constant), fail-closed en
production (vérifié en direct sur Staging, secrets absents → 401
systématique), protégés contre le replay (fenêtre 5 min) et le rejeu
(idempotence transport `WebhookEvent` + idempotence métier Ledger déjà
en place). Un problème réel de concurrence trouvé en testant
rigoureusement l'Étape 8 (pas de faille financière — le Ledger a
absorbé le risque — mais des réponses HTTP incorrectes et une fuite
mineure de détail interne sous course réelle) a été corrigé par un
changement minimal et ciblé dans la seule couche journal webhook,
sans toucher au Ledger ni à la logique métier. Aucune régression sur
P0.2 ni P1.12, tous deux revérifiés en direct sur Staging.

## 18. Critères de PASS — checklist

- [x] tous les webhooks identifiés (2, exhaustif)
- [x] aucun webhook sensible fail-open (vérifié en direct)
- [x] secret absent → refus sécurisé (401, vérifié en direct)
- [x] signature valide → acceptée (tests locaux)
- [x] signature invalide → refusée
- [x] payload altéré → refusé
- [x] replay correctement traité
- [x] idempotence persistante (atomique après correctif)
- [x] concurrence validée (20× même événement, 20× événements différents, ×2 webhooks)
- [x] aucun double effet métier
- [x] aucun HTTP 500 inattendu
- [x] secrets absents des logs (vérifié en direct)
- [x] tests unit OK (225/225)
- [x] tests integration OK (86/86)
- [x] E2E analysés (55/57, 2 échecs préexistants documentés)
- [x] build OK
- [x] staging validé (dans les limites documentées §12)
- [x] P0.2 inchangé (revérifié en direct)
- [x] P1.12 inchangé (revérifié en direct)
- [x] Ledger/Wallet/Payments inchangés
- [x] production inchangée
- [x] rapport complet

Aucun push effectué. Aucun déploiement ni modification de `kessia`
(production).
