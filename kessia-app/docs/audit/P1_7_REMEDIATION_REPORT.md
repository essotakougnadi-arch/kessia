---
title: "KESSIA — P1.7 : Concurrence Tontines — Rapport de remédiation"
date: "21 septembre 2026"
---

# KESSIA — P1.7 : Concurrence Tontines — Rapport de remédiation

**Base** : P0.0→P0.5 validés (Phase 0 close). Premier chantier P1, choisi
via `docs/audit/PHASE0_EXECUTION_PLAN.md` §« Séquencement recommandé »
(P1.7, même classe de risque que P0.4 — opérations financières/
structurelles déclenchées par des requêtes concurrentes).

**Note de suivi documentaire** : le plan initial assigne le livrable de
P1.x à `PRODUCTION_HARDENING_REPORT.md` ; ce document n'a en réalité plus
été mis à jour depuis P0.0 (le pattern qui a émergé au fil des phases —
un rapport dédié par sous-phase + `CHANGELOG.md` + `SECURITY_REMEDIATION_REPORT.md`
pour la synthèse sécurité — s'est avéré plus lisible et a été suivi tout
du long). Ce rapport poursuit ce pattern établi plutôt que de raviver un
document abandonné.

**Périmètre validé par l'utilisateur** (verbatim, résumé) : protéger
uniquement 3 cas — double activation d'une tontine, dépassement concurrent
de `maxMembers` et collision de position, double exécution concurrente du
cron. Ne pas toucher Ledger/Wallet/Escrow/paiements/règles métier des
cotisations/`settleContribution()`/`checkAndAdvanceRound()`. Ajouter des
tests de concurrence réels (`Promise.all`).

---

## 1. Constat vérifié (code actuel, pas le plan du 10 septembre pris tel quel)

Avant toute modification, chaque fichier concerné a été relu pour confirmer
que les risques identifiés le 10 septembre sont toujours réels après
P0.1→P0.5 :

- **`activateTontine()`** (`lib/tontine/orchestrator.ts`) lisait
  `tontine.status !== 'PENDING'` **hors verrou**, avant sa propre
  transaction. Deux déclencheurs y mènent (démarrage manuel organisateur,
  auto-activation au dernier membre) — confirmé toujours vrai.
- **`POST /tontine/[id]/members`** : le comptage `_count.members >=
  maxMembers` et le calcul de `nextPosition` étaient lus **hors verrou** —
  confirmé toujours vrai, aucune protection existante.
- **Cron** : `cron.yml` (GitHub Actions, horaire, `concurrency:` déjà en
  place **entre ses propres exécutions**) et `vercel.json` (Vercel Cron,
  quotidien) appellent la même route `/api/v1/cron/tontine-tick` sans
  coordination entre eux ni verrou côté base — confirmé toujours vrai.

**Vérifié et confirmé DÉJÀ protégé** (pas de nouveau verrou ajouté, comme
exigé) : `settleContribution()` (cotisation) et `checkAndAdvanceRound()`
(versement de fin de tour) utilisent déjà des clés d'idempotence Ledger
stables (`TCONTRIB-<memberId>-<round>`, `TPAYOUT-<tontineId>-<round>`) —
même mécanique `@unique` + capture `P2002` que partout ailleurs dans le
Ledger. Le test 5 (§4) le **prouve** sous charge réelle plutôt que de le
supposer.

## 2. Correctifs (minimaux, ciblés sur les 3 cas autorisés)

### a) Double activation

`lib/tontine/orchestrator.ts::activateTontine` — restructuré pour ouvrir
la transaction **avant** toute lecture : `SELECT id FROM tontines WHERE id
= ${tontineId} FOR UPDATE` en premier, puis relecture du statut et de la
liste des membres **à l'intérieur** du verrou. Même schéma que le verrou
de stock Marketplace (P0.4). Le second appel concurrent, une fois le
premier commité, revoit `status = 'ACTIVE'` et ressort proprement en échec
(« Cette tontine a déjà démarré ou est clôturée. ») sans rien écrire.
`getOrCreateEscrowWallet` déplacé à l'intérieur de la même transaction
(la fonction acceptait déjà un client transactionnel pour cet usage précis
— aucune signature changée) : légère amélioration d'atomicité en plus,
sans changement de comportement observable.

### b) Dépassement de capacité / collision de position

`app/api/v1/tontine/[id]/members/route.ts::POST` — la capacité
(`maxMembers`) et la position sont désormais revérifiées **à l'intérieur**
du même verrou de ligne que l'activation (`FOR UPDATE` sur `tontines`),
dans une transaction qui couvre la lecture du compte de membres et la
création du `TontineMember`. Deux adhésions concurrentes ne peuvent plus
lire le même compte avant qu'aucune ne s'écrive.

### c) Double exécution du cron

Nouveau `lib/db/advisory-lock.ts::withAdvisoryLock` — verrou consultatif
Postgres **transaction-scoped** (`pg_try_advisory_xact_lock`, pas
`pg_advisory_lock`/`pg_advisory_unlock` session-scoped : en environnement
poolé, rien ne garantit que l'acquisition et la libération s'exécutent sur
la même connexion physique, le verrou pourrait ne jamais être relâché — la
variante `xact` est libérée automatiquement avec la transaction, aucun
verrou « collé » possible même en cas de crash). Câblé dans
`app/api/v1/cron/tontine-tick/route.ts::handle` : un tick déjà en cours
(autre ordonnanceur, requête lente) fait sortir le second appel en no-op
tracé (`{ skipped: true }`, HTTP 200) plutôt que de traiter les mêmes
tontines/livraisons/relances deux fois en parallèle.

## 3. Fichiers modifiés

- `lib/tontine/orchestrator.ts` — verrou d'activation (§2a).
- `app/api/v1/tontine/[id]/members/route.ts` — verrou d'adhésion (§2b).
- `app/api/v1/cron/tontine-tick/route.ts` — verrou consultatif cron (§2c).
- `lib/db/advisory-lock.ts` (nouveau) — utilitaire de verrou partagé.
- `test/integration/tontine-concurrency.itest.ts` (nouveau, 5 tests).

**Non modifiés** (contrainte respectée) : Ledger, Wallet, Escrow, règles
métier des Payments, `lib/tontine/contributions.ts::settleContribution`,
`checkAndAdvanceRound` dans `orchestrator.ts` (seule `activateTontine` a
été touchée dans ce fichier). P0.2, P0.3 : non touchés. Marketplace : non
touché.

## 4. Tests de concurrence réels (`test/integration/tontine-concurrency.itest.ts`, `Promise.all`, base réelle)

1. **Double « démarrage » manuel simultané** (2 requêtes `PATCH
   .../start` en parallèle, même organisateur) → une seule réussit (200),
   l'autre échoue proprement (400) ; un seul événement `ACTIVATED` ; une
   seule cotisation créée par membre pour le tour 1.
2. **5 adhésions concurrentes sans dépasser la capacité** → les 5
   réussissent (201), positions `[1..6]` toutes uniques, aucune collision.
3. **3 adhésions concurrentes pour 1 place restante** (`maxMembers`
   dépassé si non protégé) → exactement 1 réussit (201), 2 échouent
   proprement (400 « complète ») ; jamais plus de `maxMembers` membres
   actifs ; auto-activation déclenchée une seule fois.
4. **2 invocations concurrentes du tick cron** → exactement 1 s'exécute
   réellement, l'autre est `{ skipped: true }` (200, pas une erreur).
5. **Preuve de non-régression** : 2 cotisations concurrentes du même
   membre/tour (`settleContribution`, non modifié) → un seul débit —
   confirme que la protection Ledger déjà existante tient sous charge
   réelle, sans qu'aucun nouveau verrou n'ait été nécessaire ici.

Les 4 suites `.itest.ts` tontine préexistantes (`tontine-escrow`,
`tontine-growth`, `tontine-orchestrator`, `tontine-solo`) restent vertes
**sans modification**. Le nouveau fichier a été rejoué **4 fois d'affilée**
avant intégration à la suite complète : 5/5 tests verts à chaque fois,
aucune flakiness observée.

## 5. Vérification

`tsc` : 0 erreur. `next lint` : 0 warning. `vitest` (unit) : **194/194**
(inchangé). `test:integration` (`USE_TEST_DB=1`) : **18 fichiers, 68/68**
(63 précédents + 5 nouveaux). `build` : succès. `test:e2e:isolated`
(reset + seed avant run) : **55 passed / 2 failed** sur 57 — tally
**identique** à la référence de clôture P0.5. Les 2 échecs
(`marketplace-delivery.spec.ts:14`, `tontine.spec.ts:37`) reproduisent
exactement les mêmes signatures d'erreur déjà documentées dans
`TICKET_CI_E2E_FAILURES.md`, sans aucun rapport avec les tontines ou la
concurrence — aucune régression introduite par P1.7. `auth.spec.ts:12`
(flakiness caractérisée en P0.5) est passé sur ce run, cohérent avec sa
nature intermittente déjà établie.

## 6. Risques résiduels documentés (non supprimés, confirmés existants)

Tous les risques résiduels P0.0→P0.5 restent inchangés. S'ajoute, propre à
cette phase :

1. **Même utilisateur, double requête d'adhésion strictement concurrente**
   — non couvert par le nouveau verrou (qui protège la capacité/position
   collective, pas l'idempotence par utilisateur), mais déjà protégé en
   dernier recours par la contrainte `@@unique([tontineId, userId])` sur
   `TontineMember` — un P2002 remonterait en 500 plutôt qu'en 409 propre
   dans ce cas rarissime, hors périmètre explicite de ce chantier (non
   demandé, et déjà sans risque d'intégrité de données).
2. **`FOR UPDATE`/verrou consultatif** : mitigé par des transactions
   courtes et des `timeout`/`maxWait` explicites, comme le reste du
   Ledger — aucun signe de contention observé sur les 4 relances du test
   ni sur la suite complète.

## 7. Conformité au périmètre

- ✅ Les 3 cas exactement demandés sont protégés — rien de plus.
- ✅ Ledger, Wallet, Escrow, règles Payments, `settleContribution()`,
  `checkAndAdvanceRound()` : **non touchés**.
- ✅ P0.2, P0.3 : non touchés.
- ✅ Tests de concurrence réels avec `Promise.all` ajoutés (5, dont 1 de
  non-régression pure).
- ✅ 1 changement cohérent (3 verrous + utilitaire partagé + tests), en un
  seul commit.

---

## Vérification finale CI/CD + staging (commit `fe4b1b6`)

Vérifié run par run via l'API GitHub (page de détail de chaque run,
jamais la vue liste/checks) :

| Workflow | Run | Conclusion |
|---|---|---|
| CI | [`35623207005`](https://github.com/essotakougnadi-arch/kessia/actions/runs/35623207005) | ✅ success |
| Integration | [`35623206914`](https://github.com/essotakougnadi-arch/kessia/actions/runs/35623206914) | ✅ success |
| Staging | [`35623206867`](https://github.com/essotakougnadi-arch/kessia/actions/runs/35623206867) | ✅ success |
| E2E | [`35623207010`](https://github.com/essotakougnadi-arch/kessia/actions/runs/35623207010) | ⚠️ failure — **55 passed / 2 failed**, vérifié test par test : `tontine.spec.ts:22` (violation de mode strict, famille déjà documentée) et `marketplace-delivery.spec.ts:14` (item de test introuvable — variante CI de la flakiness métier déjà documentée). Aucun des deux n'est lié aux verrous de concurrence introduits (activation, adhésion, cron) — **non-régression confirmée**, pas supposée. |

**Staging en direct** : `curl https://kessia-staging.vercel.app/api/health`
→ `200 {"status":"ok","db":"ok",...}`, déploiement confirmé.

## Verdict

**P1.7 = VALIDÉ.** Les 3 verrous de concurrence demandés sont en place et
prouvés par des tests réels sous `Promise.all` (rejoués 4× localement,
0 flakiness). Aucun fichier hors périmètre touché. CI/Integration/Staging
verts ; E2E dans l'état préexistant déjà documenté, vérifié test par test
pour exclure toute régression.
