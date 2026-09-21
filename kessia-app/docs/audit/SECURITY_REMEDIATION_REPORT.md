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

## P0.3 — Webhooks (clôturé 2026-09-16)

**Rapport détaillé** : [`P0_3_REMEDIATION_REPORT.md`](./P0_3_REMEDIATION_REPORT.md)

### Vulnérabilités corrigées

| Finding | Sévérité | Correctif |
|---|---|---|
| `if (!secret) return true` sur les 2 webhooks entrants (paiement, Miaride) — fail-open, **secret jamais configuré nulle part** → forge de crédit wallet / statut livraison sans authentification, exploitable sur le déploiement réel | Critique (audit #3) | Fail-closed en production (réplique le pattern approuvé `cron/tontine-tick`) |
| Signature sans horodatage lié → une signature valide pouvait en théorie être rejouée indéfiniment | Moyenne | Format `t=<horodatage>,v1=<HMAC>` (lib/webhooks/verify.ts), fenêtre de tolérance 5 min |
| Aucune idempotence au niveau transport (seule l'idempotence métier en aval existait) | Basse (défense en profondeur) | `WebhookEvent` — clé de dédup `@@unique`, insertion atomique |

### Preuve de vérification

Audit préalable : **zéro test et zéro code interne n'appelaient ces routes
avant P0.3** (recherche exhaustive) → correctif appliqué sans aucun risque
de régression sur l'existant, confirmé par la suite complète : `tsc`/`lint`/
`vitest` 194/194/`test:integration` 62/62 (9 nouveaux tests de sécurité
webhook, dont rejeu du même événement → idempotent, zéro double
crédit/libération)/`build`/`test:e2e:isolated` 55/57 (8 nouveaux tests E2E
tous verts, vrai serveur `next start`). Détail complet dans le rapport P0.3.

### État résiduel (accepté, documenté)

Pas de restriction IP par allowlist (HMAC jugé suffisant, non demandée) ;
pas de route de rejeu admin (non demandée) ; fenêtre anti-rejeu fixe (5
min) ; `WebhookEvent` ne persiste pas le corps brut (choix délibéré, cf.
règle « jamais de données sensibles brutes en log »).

---

## P0.4 — Marketplace : idempotence des commandes (clôturé 2026-09-21)

**Rapport détaillé** : [`P0_4_REMEDIATION_REPORT.md`](./P0_4_REMEDIATION_REPORT.md)

### Vulnérabilités / findings corrigés

| Finding | Sévérité | Correctif |
|---|---|---|
| Clé d'idempotence `Date.now()` sur `POST /marketplace/[id]/order` — retry-unsafe, un rejeu produit un second débit réel | Critique (audit #9/#14) | En-tête `Idempotency-Key` (convention déjà établie ADR 0007 §3) → `MarketplaceOrder.idempotencyKey` `@unique` |
| Stock lu une fois, jamais verrouillé — survente possible entre acheteurs concurrents | Haute (audit #14) | `SELECT ... FOR UPDATE` sur `marketplace_items` dans la transaction de décrément, mirroir de `lockWallets` |
| Paiement et commande dans deux transactions séparées — crash possible entre les deux (argent débité, aucune commande) | Haute | Auto-guérison par la clé stable (un rejeu complète l'étape manquante sans re-débiter) + reversal immédiat si conflit de stock découvert après paiement |
| Mode TONTINE sans idempotence — double tontine/commande possible sur rejeu | Moyenne | Même vérification `idempotencyKey` en amont |

### Preuve de vérification

Audit préalable : `postDoubleEntry` (Ledger), `releaseEscrowToSeller`/
`refundEscrowToBuyer` (Escrow) et `confirmDelivered` (Delivery) déjà sains
et idempotents — confirmés, **non modifiés**. Correctif vérifié par
`test:integration` (7 nouveaux tests dont 2 de **concurrence réelle** via
`Promise.all` : rejeu concurrent avec la même clé → une seule commande
créée ; deux acheteurs concurrents du dernier exemplaire → un seul réussit,
l'autre remboursé, stock jamais négatif) + suite complète verte
(`tsc`/`lint`/`vitest`/`build`/E2E). Détail complet dans le rapport P0.4.

### État résiduel (accepté, documenté)

Panier : clés d'idempotence non persistées entre rechargements de page
(protection efficace contre le rejeu réseau automatique, pas contre un
abandon-puis-nouvelle-tentative après fermeture d'onglet — jugé
disproportionné à corriger) ; notification vendeur en double sous
concurrence sur l'escrow (cosmétique, sans impact financier, déjà
documenté en P0.2/P0.3).

---

## P0.5 — KYC / conformité / LAB-FT (clôturé 2026-09-21)

> Note de numérotation : `PHASE0_EXECUTION_PLAN.md` prévoyait initialement
> « P0.5 = Configuration de production » (CSP/HSTS/garde de démarrage — voir
> ce plan pour le détail, toujours à traiter). Le déroulement réel de la
> phase 0, phase par phase, a placé l'audit KYC/LAB-FT à ce numéro — c'est
> ce travail qui est documenté ci-dessous. La configuration de production
> reste à faire, sans numéro P0.x fixe pour l'instant (voir note de fin de
> document).

**Rapport détaillé** : [`P0_5_REMEDIATION_REPORT.md`](./P0_5_REMEDIATION_REPORT.md)

### Constats (audit vérifié contre le code, pas seulement la documentation)

Le document `docs/compliance/matrix.md` §3 existait déjà mais datait d'avant
P0.0→P0.4 ; chaque ligne a été revérifiée contre le code actuel.

| Constat | Sévérité | Nature |
|---|---|---|
| `marketplace/[id]/order` (mode WALLET) ne vérifiait pas les plafonds KYC, contrairement à `wallet/transfer`/`payments` | Moyenne (contournement de plafond réel) | Correction |
| Aucune divulgation à l'utilisateur que la vérification KYC est un contrôle interne, pas réglementaire | Moyenne (risque de conformité perçue) | Correction |
| Le stub de screening sanctions/PPE n'est appelé nulle part (documentation antérieure inexacte) | Faible (déjà non fonctionnel, juste mal documenté) | Documentation corrigée |
| Transition `EXPIRED` jamais déclenchée (dead code) | Faible (fonctionnalité absente, pas défaillante) | Documenté comme manquant |

### Correctifs

- `checkOutboundLimit` étendu à `marketplace/[id]/order` (mode WALLET) —
  même pattern que `wallet/transfer`/`payments`. `SALE_PAYMENT` ajouté à
  `OUTBOUND_TYPES` pour une agrégation mensuelle correcte.
- Bandeau de transparence ajouté sur `/profile/kyc` (FR+EN) — même motif
  déjà utilisé par `/insurance`/`/tontine/garantie`.
- `docs/compliance/matrix.md` §3 corrigé ligne par ligne.

### Délibérément non fait

Screening non câblé (câbler une liste factice créerait une fausse
conformité) ; `EXPIRED` non implémenté (nécessite une politique de
péremption à définir avec la conformité, hors portée technique).

### Preuve de vérification

3 nouveaux tests d'intégration (`marketplace-kyc-limits.itest.ts`), base
réelle, dont un vérifiant explicitement que les achats marketplace sont
comptés dans l'agrégation mensuelle (pas de contournement par achats
répétés). Suite complète verte (`tsc`/`lint`/`vitest`/`test:integration`/
`build`/E2E). Détail complet dans le rapport P0.5.

### État résiduel (accepté, documenté)

Screening sanctions/PPE et liveness réels toujours absents (bloquants déjà
connus avant activation de services financiers réels, désormais disclosés
à l'utilisateur) ; `EXPIRED` non implémenté ; valeurs de plafonds non
calées sur la réglementation réelle ; déclaration de soupçon/gel des
avoirs à définir.

---

*Configuration de production (CSP/HSTS/garde de démarrage — périmètre
initialement prévu sous P0.5, voir `PHASE0_EXECUTION_PLAN.md`) et les
phases P1.x (réconciliation, concurrence, staging, secrets, pool de
connexions, rate limiting, observabilité, backup/DR, protection des
données, tests de sécurité) restent à traiter et seront ajoutées à ce
document au fur et à mesure.*
