---
title: "KESSIA — Rapport de remédiation sécurité"
date: "14 septembre 2026 (créé) — mis à jour à chaque phase P0.x"
---

# KESSIA — Rapport de remédiation sécurité

Document vivant, mis à jour à la clôture de chaque sous-phase P0.x du plan
`PHASE0_EXECUTION_PLAN.md`. Chaque section documente : le problème initial,
le correctif appliqué, la preuve de vérification, et l'état résiduel.

---

## P0.1 — Framework Next.js & dépendances (clôturé 2026-09-14)

**Rapport détaillé** : [`P0_1_REMEDIATION_REPORT.md`](./P0_1_REMEDIATION_REPORT.md)

### Vulnérabilités corrigées

| ID / description | Sévérité | Composant | Correctif |
|---|---|---|---|
| `GHSA-p293-qw3h-jr36` — RCE non authentifiée | Critique | `next` | `next@14.2.5 → 15.5.24` |
| `GHSA-2xp9-vwfh-vxw4` — RCE non authentifiée | Critique | `next` | `next@14.2.5 → 15.5.24` |
| `GHSA-f82v-jwr5-mffw` — contournement d'autorisation middleware | Haute | `next` | résolu par le même bump |
| CVE(s) `postcss` (pin interne obsolète de `next`) | Haute | `postcss` (transitif) | `overrides: postcss@^8.5.23` |
| Dépendance morte exposant des peers bruyants (`next@16`/`react@19`) | — | `next-auth` | supprimée (0 usage vérifié) |
| Dépendance morte | — | `uuid` / `@types/uuid` | supprimées (0 usage vérifié — `crypto.randomUUID()` natif déjà utilisé) |

### Preuve de vérification

`npm audit` avant : 15 (2 critiques, 9 hautes, 4 modérées).
`npm audit` après : 8 (0 critique/haute liée à Next.js). Recherche explicite
des deux identifiants CVE dans la sortie JSON complète : **absents**. Détail
complet, méthodologie et résiduel dans le rapport P0.1.

### État résiduel (accepté, documenté)

8 vulnérabilités devDependencies (`eslint-config-next`/`glob` — nécessite
Next 16 ; `vitest`/`vite`/`esbuild` — nécessite un bump majeur vitest 5.x),
**0 exposition runtime production**. Voir P0_1_REMEDIATION_REPORT.md §4 pour
le détail et le plan de traitement différé.

---

## P0.2 — Sessions et tokens (non commencé)

**Statut** : bloqué, en attente d'autorisation explicite de l'utilisateur
après validation de P0.1.

Périmètre prévu (cf. `PHASE0_EXECUTION_PLAN.md` §P0.2) : cookies HttpOnly
côté serveur, retrait des tokens de `localStorage`, vérification de session
(pas seulement JWT) dans `withAuth`, CSRF (`Origin`/`Sec-Fetch-Site`),
révocation effective (logout / changement de mot de passe / suspension
admin), détection de réutilisation de refresh token. Inclut la correction du
bug de collision `Session.token` identifié pendant P0.0/P0.1 et
explicitement réservé à cette phase.

---

## P0.3 — Webhooks (non commencé)

Périmètre prévu : `verifyWebhook` fail-closed en production sans secret,
journal `WebhookEvent` + rejeu, restriction de source IP (optionnelle).

---

## P0.4 — Marketplace : idempotence des commandes (non commencé)

Périmètre prévu : clé d'idempotence stable côté client, chemin
transactionnel unique (verrou + débit + stock + commande dans une seule
transaction).

---

## P0.5 — Configuration de production (non commencé)

Périmètre prévu : garde de démarrage (variables d'environnement), CSP sans
`unsafe-inline`/`unsafe-eval` (nonces), HSTS, restriction `images.remotePatterns`.

---

*Les phases P1.x (réconciliation, concurrence, staging, secrets, pool de
connexions, rate limiting, observabilité, backup/DR, KYC, protection des
données, tests de sécurité) sont détaillées dans
`PHASE0_EXECUTION_PLAN.md` et seront ajoutées à ce document au fur et à
mesure de leur traitement.*
