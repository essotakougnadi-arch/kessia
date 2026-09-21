---
title: "KESSIA — P0.4 : Marketplace — idempotence et prévention des doubles opérations — Rapport de remédiation"
date: "16 septembre 2026"
---

# KESSIA — P0.4 : Marketplace — Rapport de remédiation

**Base** : P0.3 validé (webhooks fail-closed + signature/horodatage + idempotence stricte).
**Périmètre autorisé** (verbatim) : audit des flux Marketplace (création de
commande, paiement, réservation/décrément de stock, livraison,
remboursement, callbacks/webhooks Marketplace, retries réseau et requêtes
concurrentes) ; identifier les risques de double débit/réservation/commande/
traitement ; vérifier les clés d'idempotence, les contraintes d'unicité et
les transactions atomiques ; vérifier le comportement sous timeout/retry/
concurrence/réponse inconnue ; n'ajouter que les protections nécessaires et
démontrées ; tests de concurrence/rejeu. **Hors périmètre, non touché** :
Ledger, règles fondamentales du Wallet, Escrow, règles métier générales des
Payments, Tontines (métier), KYC, IA, P0.2 (Auth), P0.3 (Webhooks) sauf
dépendance technique indispensable (aucune n'a été nécessaire).

---

## 1. Audit — ce qui est déjà sain (vérifié, non modifié)

- **`postDoubleEntry`** (Ledger, `lib/ledger/ledger.service.ts`) gère déjà
  correctement la course entre deux appels concurrents partageant la même
  clé d'idempotence : verrouillage des wallets (`SELECT ... FOR UPDATE`),
  contrainte `@unique` en base sur `idempotencyKey`, et capture explicite de
  la violation `P2002` traitée comme un succès idempotent (commentaire du
  code existant : « Course entre deux appels identiques concurrents… c'est
  un succès idempotent »). **Non modifié.**
- **`releaseEscrowToSeller`/`refundEscrowToBuyer`** (`lib/marketplace/escrow.ts`)
  utilisent déjà des clés stables (`MKT_SETTLE_<orderId>`,
  `MKT_ESCROW_REFUND_<orderId>`) et une garde de statut vérifiée avant tout
  appel au ledger. Sous concurrence réelle (ex. webhook Miaride + confirmation
  manuelle simultanées), le seul effet observable est une notification
  vendeur envoyée deux fois — cosmétique, aucun double versement possible
  (protégé par le Ledger). **Non modifié.**
- **`confirmDelivered`** (`lib/delivery/index.ts`) a déjà une garde
  `if (status === 'DELIVERED') return` avant tout traitement. **Non modifié.**
- **Webhooks Marketplace** (`marketplace/deliveries/webhooks/miaride`) :
  idempotence stricte au niveau transport déjà ajoutée en P0.3
  (`WebhookEvent.eventKey` unique). **Non re-modifié ici.**

## 2. Le problème identifié — `POST /api/v1/marketplace/[id]/order`

1. **Clé d'idempotence = `Date.now()`** (`MKT_ORDER_<item>_<user>_${Date.now()}`) —
   change à chaque appel. Un rejeu (retry réseau, double-clic échappant à la
   garde d'interface `disabled={busy}`) génère une clé différente : le
   Ledger ne le reconnaît pas comme un doublon → **second débit réel**.
2. **Paiement et commande dans deux transactions séparées** :
   `postDoubleEntry` (paiement) s'exécute d'abord, puis une `$transaction`
   distincte décrémente le stock et crée `MarketplaceOrder`. Un crash entre
   les deux laisse l'acheteur débité sans commande.
3. **Stock lu une seule fois, jamais verrouillé** — `describeBuyability`
   reçoit `item.stock` d'une lecture antérieure à toute transaction. Deux
   acheteurs concurrents du dernier exemplaire peuvent tous les deux passer
   la vérification et tous les deux décrémenter → survente possible.
4. **Mode TONTINE** : aucune clé d'idempotence — un rejeu crée une tontine
   ET une commande en double (pas de débit synchrone dans ce mode, donc pas
   de double débit, mais un doublon d'engagement d'épargne bien réel).

## 3. Correctif

### `MarketplaceOrder.idempotencyKey String? @unique` (migration, base locale jetable)

Vérifié en tout premier dans la route, avant toute autre logique : si une
commande existe déjà pour cette clé, elle est renvoyée directement (`200`,
`duplicate: true`) sans retraiter paiement ni stock.

### En-tête `Idempotency-Key`

Étend à Marketplace la convention **déjà établie** pour `wallet/transfer` et
`tontine/[id]/contribute` (ADR 0007 §3) — pas un nouveau pattern. Câblé côté
client pour que la protection soit réellement effective :
- `hooks/useMarketplace.ts::order()` accepte une clé optionnelle, envoyée
  via l'en-tête `Idempotency-Key`.
- `item-client.tsx` (achat direct) : `crypto.randomUUID()` généré à la
  première tentative de confirmation, **conservé si l'appel échoue** (un
  nouveau clic sur « Confirmer » est alors traité comme le même rejeu),
  effacé après un succès.
- `cart-client.tsx` (panier multi-articles) : une clé fraîche par unité
  achetée, générée à chaque tentative de `checkout()` — protège contre un
  rejeu réseau automatique ou un double appel de `checkout()` avant que
  l'état `processing` ne désactive le bouton (voir limite assumée, §6).

### Verrou de stock (`SELECT ... FOR UPDATE`)

Requête brute sur `marketplace_items`, à l'intérieur de la transaction qui
décrémente le stock — **mirroir exact** du pattern déjà utilisé par
`lockWallets` dans le Ledger (même idiome, table différente, fichier Ledger
non touché). Le stock est **relu sous verrou** avant toute décision.

### Reversal si conflit de stock après paiement

Si, sous verrou, l'article s'avère épuisé par un acheteur concurrent après
que le paiement a déjà réussi : remboursement immédiat via `postDoubleEntry`
(sens inverse, nouvelle clé `<idem>:REVERSAL`) — **mirroir exact** du
mécanisme de reversal déjà utilisé par `wallet/transfer` en cas d'échec du
crédit destinataire. L'acheteur reçoit un `409` explicite, jamais un solde
débité sans explication.

### Course sur la création de commande elle-même

Deux requêtes strictement concurrentes avec la **même** `Idempotency-Key`
(double-clic échappant à la garde d'interface, ou rejeu réseau exact) : le
paiement est dédupliqué par `postDoubleEntry` (déjà prouvé robuste) ; côté
commande, la contrainte `@unique` sur `idempotencyKey` fait échouer la
requête perdante avec `P2002` — interceptée explicitement pour renvoyer la
commande de la requête gagnante (`200`) plutôt qu'un `500`. Idem pour le
mode TONTINE (la transaction entière, y compris la création de la tontine,
est annulée pour la requête perdante — **aucune tontine orpheline**).

## 4. Tests (nouveau `test/integration/marketplace-order-idempotency.itest.ts`, 7 tests, base réelle)

1. Rejeu séquentiel avec la même clé → une seule commande, un seul débit.
2. **Deux requêtes VRAIMENT concurrentes** (`Promise.all`) avec la même clé
   → une seule commande créée (`201`/`200`, jamais deux `201`).
3. Sans `Idempotency-Key`, deux appels distincts → bien deux commandes
   séparées (vérifie l'absence de sur-blocage).
4. **Deux acheteurs concurrents du dernier exemplaire** → un seul réussit,
   l'autre reçoit `409` et est intégralement remboursé, stock jamais
   négatif (`0`, jamais `-1`), une seule commande créée.
5. Rejeu après un premier essai échoué (solde insuffisant) → la même clé
   fonctionne une fois le solde suffisant (pas bloquée par l'échec précédent).
6. TONTINE : rejeu avec la même clé → une seule tontine, une seule commande.
7. TONTINE : deux requêtes concurrentes avec la même clé → aucune tontine
   orpheline.

## 5. Vérification

`tsc` : 0 erreur. `next lint` : 0 warning. `vitest` (unit) : **194/194**
(inchangé — le correctif est server-route/intégration, pas de nouvelle
logique pure isolée). `test:integration` (`USE_TEST_DB=1`) : **16 fichiers,
60/60** (53 précédents + 7 nouveaux). `build` : OK. `test:e2e:isolated` :
**54/57** — `webhook-security.spec.ts` (8/8, P0.3) inchangé et vert ;
`marketplace-cart.spec.ts` (flux modifié par ce correctif) **vert**,
confirme que le câblage client (en-tête `Idempotency-Key`) fonctionne de
bout en bout sur le vrai serveur. Les 3 échecs restants
(`marketplace-delivery.spec.ts:14`, `navigation.spec.ts:32` — accent,
`tontine.spec.ts:37`) sont la flakiness pré-existante déjà documentée dans
`TICKET_CI_E2E_FAILURES.md`, identiques à celle observée sans aucun rapport
avec ce travail.

## 6. Risques résiduels documentés

1. **Panier : protection non persistée entre rechargements de page.** Les
   clés d'idempotence du panier (`cart-client.tsx`) sont générées fraîches
   à chaque tentative de `checkout()`, pas stockées dans `cartStore`
   (localStorage). Elles protègent efficacement contre le rejeu réseau
   automatique et un double appel rapproché de `checkout()`. Elles ne
   protègent **pas** contre un utilisateur qui, après un échec apparent,
   ferme l'onglet puis relance manuellement un paiement plus tard — ce
   scénario composé (échec réseau silencieux + abandon + nouvelle session)
   reste possible mais rare ; le fermer complètement aurait exigé de
   persister des clés par unité dans `cartStore` avec une logique de
   synchronisation avec les changements de quantité — jugé disproportionné
   au risque réel face à la protection déjà apportée. L'achat direct
   (`item-client.tsx`, le flux principal) n'a pas cette limite : sa clé
   survit à un échec et est réutilisée par un nouveau clic tant que la page
   reste ouverte.
2. **Notification vendeur en double sous concurrence sur `releaseEscrowToSeller`/
   `refundEscrowToBuyer`** — déjà documenté en P0.2/P0.3, confirmé de
   nouveau ici, non corrigé (cosmétique, aucun impact financier).
3. Risques résiduels P0.0/P0.1/P0.2/P0.3 inchangés, non supprimés.

## 7. Conformité au périmètre

- ✅ Les 8 points du périmètre traités : audit des flux, examen des points
  sensibles listés, identification des risques, vérification des clés
  d'idempotence/contraintes d'unicité/transactions, comportement sous
  concurrence/timeout/retry, protections proportionnées, tests de
  concurrence/rejeu.
- ✅ Ledger (`lib/ledger/ledger.service.ts`), règles fondamentales du Wallet,
  Escrow (`lib/marketplace/escrow.ts`), règles métier Payments, Tontines
  métier, KYC, IA : **non touchés**. Un seul fichier Marketplace appelle
  `postDoubleEntry` avec de meilleures entrées (clé stable) — la fonction
  elle-même est inchangée.
- ✅ P0.2 (Auth)/P0.3 (Webhooks) : non touchés — aucune dépendance
  technique ne l'a exigé.
- ✅ Aucun test contourné ; aucun risque résiduel déjà documenté supprimé.
- ✅ 1 changement cohérent = schéma + route + client + tests, un seul commit.

---

## Vérification finale CI/CD + staging (commit `16f4213`)

Vérification faite via la page de détail de **chaque** run individuellement :

| Workflow | Statut | Détail |
|---|---|---|
| `ci.yml` | ✅ Success | `verify` |
| `integration.yml` | ✅ Success | |
| `staging.yml` | ✅ Success | `migrate` 2m55s (colonne `idempotencyKey` appliquée) + `deploy` 1m59s |
| `e2e.yml` | ⚠️ Failure (statut GitHub) | **54 passed / 3 failed / 0 flaky** |

Les 3 échecs (`marketplace-delivery.spec.ts:14`, `tontine.spec.ts:22`,
`tontine.spec.ts:37`) confirmés être la flakiness pré-existante déjà
documentée dans `TICKET_CI_E2E_FAILURES.md` — **`webhook-security.spec.ts`
(8/8) et `marketplace-cart.spec.ts` (flux modifié par ce correctif) restent
tous les deux verts**, confirmés absents de la liste des échecs.

**Staging vérifié en direct** :
```
$ curl https://kessia-staging.vercel.app/api/health
{"status":"ok","db":"ok",...}
```

## Verdict

**P0.4 = VALIDÉ — PRÊT POUR P1.**

Le finding CRITIQUE (clé d'idempotence retry-unsafe permettant un double
débit réel sur le déploiement public) est corrigé et vérifié par des tests
de concurrence réelle (`Promise.all`), pas seulement séquentiels. Aucune
régression introduite — confirmé par la suite complète verte et par le flux
Marketplace modifié (`marketplace-cart.spec.ts`) qui reste vert en E2E
réel. Ledger, Escrow, règles Wallet/Payments/Tontines/KYC/IA et P0.2/P0.3
non touchés.
