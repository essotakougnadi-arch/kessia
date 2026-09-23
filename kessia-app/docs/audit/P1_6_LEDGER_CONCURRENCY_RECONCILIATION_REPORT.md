---
title: "KESSIA — P1.6 : Ledger Core — concurrence / double-entry / réconciliation — Rapport"
date: "23 septembre 2026"
---

# KESSIA — P1.6 : Ledger Core — concurrence, double-entry, réconciliation

**Base** : P0.0-P0.4, P1.7, P1.9, P1.12 déjà validés — non refaits. Ce
chantier reprend précisément le constat documenté (non corrigé) à la
clôture de P0.4.

**Verdict : `PASS`.**

## 1. Modèle Ledger actuel

- `Wallet.balance` (`Decimal(18,2)`) : solde **matérialisé**, mis à jour
  à chaque écriture — pas recalculé dynamiquement à la lecture.
- `LedgerEntry` : une ligne par mouvement (`direction` CREDIT/DEBIT,
  `amount`, `balanceBefore`, `balanceAfter`, `idempotencyKey @unique`).
- Deux fonctions d'écriture dans `lib/ledger/ledger.service.ts` :
  - `createLedgerEntry` — une seule jambe (un wallet).
  - `postDoubleEntry` — deux jambes atomiques (débit `walletA` + crédit
    `walletB` dans la même transaction), clé de base scindée en
    `${key}:out` / `${key}:in`. Employée par tout mouvement
    tontine ↔ séquestre et marketplace ↔ séquestre/vendeur.
- `lockWallets(tx, ids)` : `SELECT ... FOR UPDATE` sur les wallets
  concernés, verrouillés dans l'ordre lexicographique (exclut
  l'inter-blocage entre transactions concurrentes touchant les mêmes
  wallets dans un ordre différent).
- Pas de nouveau modèle comptable introduit — le modèle existant est
  conservé à l'identique.

## 2. Invariants financiers

Vérifiés conceptuellement puis empiriquement (§7 nouveaux tests) :
- **Debit = Credit** pour chaque `postDoubleEntry` : les deux jambes
  portent le même `amount`, créées dans la même transaction.
- **balanceAfter = balanceBefore ± amount**, toujours, pour chaque
  écriture individuelle.
- **Chaînage** : sur un même wallet, le `balanceBefore` d'une écriture
  correspond au `balanceAfter` de la précédente (ou au solde initial
  pour la première) — vérifié explicitement par un nouveau test
  (3 opérations séquentielles chaînées).
- **Réconciliation** (Étape 9) : `wallet.balance` == solde initial +
  somme signée des `LedgerEntry` de ce wallet — vérifié sur un scénario
  contrôlé à 3 wallets / 3 opérations. Aucune fonction de réconciliation
  générique n'existait (seule `reconcileTontineEscrow`, scopée tontine,
  déjà existante et non touchée) — pas de nouveau système créé,
  conformément à la consigne ; un test ciblé suffit à prouver
  l'invariant sur les scénarios du chantier.

## 3. Flux double-entry & 4. Frontières transactionnelles (Étape 3)

Pour `postDoubleEntry` (et `createLedgerEntry`, structure identique à
une jambe) :

1. Vérification d'idempotence **hors transaction** (chemin rapide).
2. `prisma.$transaction(...)` démarre.
3. `lockWallets` — **verrou acquis ICI**, avant toute lecture de solde.
4. Lecture fraîche des soldes **sous verrou**.
5. Calcul `balanceAfter`, garde de solde négatif.
6. Création des écritures, mise à jour des soldes.
7. Commit.

**Réponse à la question critique de l'Étape 3** : le verrou est bien
acquis **avant** la lecture du solde utilisé pour « Solde insuffisant »
— ce n'est donc **pas** un TOCTOU classique sur le solde lui-même.

## 5. Verrouillage — ce qu'il couvre réellement

Le verrou couvre correctement l'accès concurrent aux **soldes**
(exclut toute lecture-modification-écriture croisée entre deux
opérations différentes). Il ne couvrait, **avant ce chantier**, aucune
protection contre le cas où **deux transactions concurrentes portent
la MÊME idempotencyKey** : l'idempotence n'était vérifiée qu'une fois,
avant la transaction, jamais revérifiée après l'acquisition du verrou.

## 6. Idempotence — audit

- Générée par l'appelant (`MKT_SETTLE_<orderId>`, `PAYTX_<id>`, etc.),
  jamais par le Ledger lui-même sauf repli (`generateIdempotencyKey`).
- Persistée : `LedgerEntry.idempotencyKey String @unique` (contrainte
  DB réelle, jamais supprimée ni affaiblie dans ce chantier).
- Portée : globale à la table `ledger_entries` (une clé = un mouvement,
  quel que soit le wallet).
- **Avant correctif** : un doublon **séquentiel** était géré
  proprement (chemin rapide hors transaction). Un doublon **concurrent**
  pouvait heurter la contrainte `@unique` sur `create()` — géré pour
  `postDoubleEntry` (capture `P2002` → résolution), **pas géré du tout**
  pour `createLedgerEntry` (aucune capture `P2002`, erreur Prisma brute
  remontée telle quelle).

## 7. Cause du problème P0.4 — démontrée par reproduction (Étapes 4, 5, 11)

Deux manifestations distinctes du même défaut architectural
(catégorie **E — idempotence mal positionnée**, Étape 11), reproduites
avant tout correctif :

**A. `createLedgerEntry`** — CAS C/D (10 puis 20 appels vraiment
concurrents, même clé) : reproduit **4/4** — plusieurs appels échouaient
avec l'erreur Prisma brute `Unique constraint failed on the fields:
(idempotencyKey)`, sans jamais être capturée.

**B. `postDoubleEntry`** — CAS F (20 appels vraiment concurrents, même
clé, compte source dont le solde égale exactement le montant — cas réel
de `releaseEscrowToSeller`) : reproduit **systématiquement** — les
appels qui acquièrent le verrou wallet **après** que le gagnant a déjà
consommé le solde échouent en « Solde insuffisant » **avant** d'atteindre
la résolution `P2002` (qui ne couvrait donc que l'un des deux ordres
d'arrivée possibles au verrou).

**Dans les deux cas, vérifié qu'aucune corruption financière n'existait**
avant correctif : toujours exactement une écriture réelle par clé,
soldes toujours mathématiquement exacts (comptage direct des lignes en
base, jamais déduit des réponses des fonctions).

**Réponse à l'Étape 11** : le « Solde insuffisant » observé sous
concurrence n'était **ni** (A) une véritable insuffisance de fonds, **ni**
(B) une lecture obsolète du solde (le verrou précédait bien la lecture),
**ni** (F) un verrouillage insuffisant au sens propre (aucune donnée
financière n'a jamais été corrompue) — c'est précisément (E) une
**idempotence mal positionnée** : revérifiée hors verrou seulement,
jamais à l'intérieur, avant la décision financière.

## 8. Correction appliquée (minimale, Ledger core uniquement)

Dans les deux fonctions, ajout d'une **réclamation atomique** : la
présence de l'écriture (par `idempotencyKey`) est revérifiée **à
l'intérieur** de la transaction, **immédiatement après** `lockWallets`,
**avant** tout calcul de solde. Si trouvée (un concurrent a committé
pendant l'attente du verrou), retour immédiat vers l'écriture existante
— sans jamais évaluer le solde. Repose entièrement sur le verrou
PostgreSQL déjà en place (aucun mutex mémoire, aucune Map locale, aucun
sleep, aucun retry aveugle, aucune contrainte supprimée). Filet de
sécurité conservé dans le `catch` externe (capture `P2002`) pour
`createLedgerEntry`, qui ne l'avait jamais eu.

**Fichiers modifiés** : uniquement `lib/ledger/ledger.service.ts`
(63 lignes). Aucun appelant modifié (`releaseEscrowToSeller`,
`refundEscrowToBuyer`, route Marketplace, journal webhook, séquestre
tontine) — signatures et contrats de retour inchangés.

## 9. Tests de concurrence — matrice complète (Étape 13)

| Test | Avant correctif | Après correctif |
|---|---|---|
| Double-entry simple | ✅ | ✅ |
| Concurrent ×2 (même clé) | ✅ | ✅ |
| Concurrent ×10 (`createLedgerEntry`) | ❌ erreurs brutes | ✅ |
| Concurrent ×20 (`createLedgerEntry`) | ❌ erreurs brutes | ✅ |
| Même idempotencyKey ×20 (`postDoubleEntry`, solde exact) | ❌ « Solde insuffisant » | ✅ tous propres |
| 20 clés différentes, même compte, fonds suffisants | ✅ | ✅ |
| Comptes différents concurrents | ✅ | ✅ |
| `releaseEscrowToSeller` ×20 | ❌ (constat P0.4) | ✅ tous propres |
| `refundEscrowToBuyer` ×20 | (non testé en P0.4) | ✅ tous propres |
| `postDoubleEntry(REVERSAL)` ×20, solde exact | (non testé) | ✅ tous propres |
| Insuffisance de fonds **réelle** (pas une course) | ✅ refusée proprement | ✅ inchangé |
| Retry (rejeu séquentiel, même clé) | ✅ | ✅ inchangé |
| Rollback (échec → aucune écriture partielle) | ✅ | ✅ revérifié explicitement |
| Reconciliation (solde == Σ écritures signées) | (non testé formellement) | ✅ nouveau test |
| Debit = Credit | (non testé formellement) | ✅ nouveau test |
| balanceBefore/After cohérents (chaînage) | (non testé formellement) | ✅ nouveau test |

Stable sur **5 runs consécutifs** pour `ledger.service.itest.ts`
(reproduction) et **4 runs consécutifs** pour l'ensemble
`ledger.service.itest.ts` + `marketplace-settlement.itest.ts` après
correctif.

## 10. Non-régression (Étape 14)

| Domaine | Vérification | Résultat |
|---|---|---|
| P0.2 (login/session/refresh/logout) | Suite `session-security.itest.ts` | ✅ inchangé |
| P0.3 (webhooks/signature/replay/idempotence) | Suite `webhook-security.itest.ts` | ✅ inchangé |
| P0.4 (Marketplace/checkout/stock/escrow) | Suites `marketplace-*.itest.ts` | ✅ inchangé, **et le constat documenté en P0.4 est désormais résolu** (assertions resserrées, `every(ok)===true` maintenant vérifié) |
| P1.12 (Upstash/rate limiting) | Vérifié en local (bypass E2E) + en direct sur Staging | ✅ inchangé |

### Vérification complète
`tsc` 0 erreur · `lint` 0 warning · unit **225/225** · intégration
**18 fichiers, 103/103** · build OK · E2E isolé **56 passed / 1 failed**
(`marketplace-delivery.spec.ts:14`, famille déjà documentée comme
préexistante, sans lien avec ce chantier).

## 11. Staging

Déployé sur **`kessia-staging` exclusivement** (Vercel CLI depuis la
racine du dépôt, hors pipeline Git, aucun push).

| Vérification | Résultat |
|---|---|
| Health | ✅ 200 |
| P0.2 (login) | ✅ 200 |
| P0.3 (webhooks sans signature) | ✅ 401 sur les deux |
| P1.12 (rate limiting) | ✅ actif, 429 observés sous rafale |
| Logs Vercel | ✅ aucun `500`, aucun secret |

**Limitation documentée** : aucun article à règlement `ON_DELIVERY`
n'est actuellement disponible dans le catalogue de démonstration
partagé de Staging — le chemin `releaseEscrowToSeller` (le cas
précisément corrigé par ce chantier) n'a donc **pas** pu être exercé
via un achat réel en conditions Staging. Non déclaré testé en direct
pour cette raison précise ; la preuve de robustesse sous charge repose
sur la suite locale (base Postgres jetable, sans risque de pollution
de données de démo partagées), rejouée à plusieurs reprises de façon
stable.

## 12. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `lib/ledger/ledger.service.ts` | `createLedgerEntry` + `postDoubleEntry` : réclamation atomique de l'idempotence sous verrou, avant calcul de solde |
| `test/integration/ledger.service.itest.ts` | 4 → 13 tests (reproduction + validation du correctif + réconciliation/chaînage) |
| `test/integration/marketplace-settlement.itest.ts` | 2 → 6 tests (refund/reversal ×20, assertions P0.4 resserrées) |

Aucun autre fichier touché. Ledger core est le seul domaine
applicatif modifié — Wallet, Escrow (logique métier), Marketplace,
Sessions (P0.2), Webhooks (P0.3), rate limiting (P1.12), KYC, AML, AI,
Tontines, Business, migrations Prisma : **non touchés**.

## 13. Commit

Un seul commit local, périmètre strictement limité aux 3 fichiers
ci-dessus + ce rapport + `CHANGELOG.md`. **Non poussé vers
`origin/main`.**

## 14. Risques résiduels

1. **Escrow marketplace non exercé en direct sur Staging** (§11) —
   preuve reposant sur la suite locale uniquement pour ce chemin
   précis ; à revérifier en direct dès qu'un article `ON_DELIVERY`
   sera disponible en démo, ou lors d'un prochain déploiement.
2. **`connection_limit=1` sur la DB Staging** — déjà documenté depuis
   P0.1 ; sans lien avec ce chantier, jamais de 500 observé.

## 15. Verdict

**VERDICT P1.6 : `PASS`.**

Le constat documenté à la clôture de P0.4 (« Solde insuffisant » sous
concurrence légitime sur `releaseEscrowToSeller`) est **root-causé avec
preuve** : idempotence revérifiée hors verrou seulement, jamais à
l'intérieur avant la décision financière — catégorie E de l'Étape 11,
démontrée empiriquement, pas supposée. Une seconde manifestation du
même défaut, plus sévère (erreur Prisma brute non gérée), a été trouvée
dans `createLedgerEntry` en construisant la matrice de reproduction
complète exigée par le mandat. Corrigé par un changement minimal et
strictement confiné au Ledger core, reposant uniquement sur le verrou
PostgreSQL déjà en place — aucune contrainte supprimée, aucun mutex
mémoire, aucun appelant modifié. Validé par 19 tests de concurrence
couvrant l'intégralité de la matrice exigée (double-entry, clés
identiques/différentes, comptes identiques/différents, escrow release,
refund, reversal, insuffisance réelle, retry, rollback, réconciliation,
debit=credit, chaînage de soldes), stables sur plusieurs runs. Aucune
régression sur P0.2, P0.3, P0.4 ni P1.12.

Aucun push effectué. Aucun déploiement ni modification de `kessia`
(production).
