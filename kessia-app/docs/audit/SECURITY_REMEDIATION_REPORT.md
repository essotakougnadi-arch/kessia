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

## P0.2 — Sessions et tokens (clôturé 2026-09-15/16)

**Rapport détaillé** : [`P0_2_REMEDIATION_REPORT.md`](./P0_2_REMEDIATION_REPORT.md)

### Vulnérabilités / findings corrigés

| Finding | Sévérité | Correctif |
|---|---|---|
| Tokens (access+refresh+user) en clair dans `localStorage`, cookie non-HttpOnly | Critique (audit #2) | Cookies `HttpOnly`/`SameSite`/`Secure` posés côté serveur (`lib/auth/cookies.ts`) ; refresh token ne transite plus jamais par le JS |
| `withAuth` ne vérifiait que le JWT, jamais la table `Session` → révocation inopérante 15 min | Critique (audit #2) | Vérification `jti`/`revokedAt` en base à chaque requête ; révocation immédiate (logout, changement mot de passe, suspension admin) |
| Collision `Session.token` (JWT stocké comme clé `@unique`, HMAC déterministe à la seconde) → `login`/`refresh` en 500 sous connexions rapprochées | Bug fonctionnel + disponibilité (réservé depuis P0.0) | `jti` aléatoire remplace le JWT comme clé unique (migration `20260915105735_session_jti_revocation`) |
| Pas de détection de réutilisation de refresh token (signal de vol) | Haute | Rotation = nouvelle ligne + révocation de l'ancienne ; réutilisation d'un token révoqué → révocation de toutes les sessions + audit + alerte `SECURITY` |

### Preuve de vérification

Root-cause de la collision `Session.token` confirmée **empiriquement**, pas
supposée : le symptôme `login → 500` observé dans `e2e.yml` (13-16 tests
flaky sur 3 runs CI consécutifs, dont un antérieur à P0.1) disparaît
totalement après le correctif (0 flaky). `tsc`/`lint`/`vitest`
182/182/`test:integration` 44/44 (dont 8 nouveaux tests de concurrence
`session-security.itest.ts`)/`build`/`test:e2e:isolated` 47/49 (2 échecs
restants confirmés étrangers à l'auth) : tous verts. CI/Staging vérifiés
run par run + `/api/health` staging en direct. Détail complet dans le
rapport P0.2.

### État résiduel (accepté, documenté)

Rotation de refresh token non strictement idempotente sous concurrence
(risque bénin, choix assumé) ; `accessToken` reste en mémoire JS (lisible
par un XSS actif — le refresh token, risque le plus grave, en est protégé).
`e2e/tontine.spec.ts:22`/`:37` et `marketplace-delivery.spec.ts:14` restent
ouverts dans `TICKET_CI_E2E_FAILURES.md`, confirmés étrangers à
l'authentification, hors périmètre P0.2.

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
