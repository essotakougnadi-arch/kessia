---
title: "KESSIA — P1.9 (Lot A) : Secrets & configuration — Rapport de remédiation"
date: "21 septembre 2026"
---

# KESSIA — P1.9 (Lot A) : Secrets & configuration — Rapport de remédiation

**Base** : P0.0→P0.5 + P1.7 validés. Audit en lecture seule présenté et
validé avant toute modification (voir échange précédent). Ce rapport
couvre uniquement le **Lot A** — correctifs sûrs et additifs, validés
explicitement par l'utilisateur.

**Rappel de périmètre** : P1.9 couvre les items P1.10 « Secrets » et le
reliquat « Configuration de production » du plan initial
(`PHASE0_EXECUTION_PLAN.md`), renumérotés par l'utilisateur.

## 1. Audit préalable (résumé)

Audit complet présenté avant toute modification : historique git entier
vérifié (aucun `.env` réel jamais committé), `.env.example`/
`.env.test.example` propres, workflows CI/CD sans fuite (usage correct
de `secrets.*`, garde anti-production déjà en place sur `staging.yml`/
`e2e.yml`/`integration.yml`), `SUPABASE_SERVICE_ROLE_KEY` confirmé
serveur-only. 9 problèmes constatés et classés par risque, présentés
avec corrections proposées, risques de régression et plan de tests
avant toute implémentation.

## 2. Fichiers modifiés

| Fichier | Nature |
|---|---|
| `next.config.js` | modifié |
| `lib/logger.ts` | modifié |
| `scripts/db-backup.mjs` | modifié |
| `lib/config/env.ts` | nouveau |
| `lib/logger.test.ts` | nouveau |
| `lib/config/env.test.ts` | nouveau |
| `CHANGELOG.md` | modifié |

## 3. Détail de chaque correction

### a) `next.config.js` — `images.remotePatterns` grand ouvert

**Constat** : `remotePatterns: [{hostname:'**'}]` alors qu'aucune image
distante n'est servie par l'app (`grep` : 0 usage réel de `<Image>`,
1 seule occurrence en commentaire). La route framework `/_next/image`
reste néanmoins exposée et proxifiait n'importe quelle URL https fournie
en paramètre — SSRF/déni de service potentiel, indépendant du code
applicatif.

**Correctif** : `remotePatterns: []`.

**Vérifié en direct sur Staging** (après déploiement) :
`curl ".../_next/image?url=https://example.com/test.png&w=256&q=75"` →
**400** (rejeté). Avant ce correctif, cette même requête aurait été
proxifiée (200).

### b) `next.config.js` — bloc `serverActions` inerte

**Constat** : `experimental.serverActions.allowedOrigins: ['localhost:3000']`
— confirmé 0 occurrence de `'use server'` dans tout le code. Résidu de
configuration sans usage, sans risque actif.

**Correctif** : bloc retiré.

### c) `lib/logger.ts` — aucune rédaction des secrets dans les logs

**Constat** : `logApiError` journalisait `error.message`/`error.stack`
bruts. Les erreurs Prisma de connexion incluent parfois la chaîne de
connexion complète (mot de passe compris) — un incident DB transitoire
pouvait faire fuiter `DATABASE_URL` vers les logs Vercel.

**Correctif** : nouvelle fonction exportée `redact()` — masque les
identifiants d'une chaîne de connexion (`scheme://user:pass@host` →
`scheme://***@host`) et la valeur des champs `password`/`secret`/
`token`/`apiKey` (JSON ou texte libre, insensible à la casse). Appliquée
récursivement (profondeur bornée à 5) à **tout** objet journalisé via un
format Winston dédié (`redactFormat`) — protège `logApiError` et tout
autre appel `logger.error/warn/info` existant ou futur, sans changement
de signature pour les appelants.

### d) `scripts/db-backup.mjs` — fuite potentielle via l'erreur `pg_dump`

**Constat** : en cas d'échec de `pg_dump`, `e.message` était journalisé
tel quel — Node inclut par défaut la commande complète (donc
`DATABASE_URL`, identifiants compris) dans le message d'erreur d'un
`execFileSync` échoué.

**Correctif** : seul un message générique + le code de sortie
(`e.status`) sont désormais journalisés ; `pg_dump` a déjà écrit son
propre diagnostic sur `stderr` via `stdio: 'inherit'`.

### e) `lib/config/env.ts` (nouveau) — pas de garde contre `DEMO_MODE=1` en production

**Constat** : aucune validation centralisée des variables
d'environnement ; `DEMO_MODE` (expose les OTP) n'avait aucun verrou
empêchant son activation accidentelle si KESSIA passe un jour à un vrai
pilote avec de vrais utilisateurs.

**Correctif** : `validateEnv()` — validation minimale (schéma Zod,
variables critiques `JWT_SECRET`/`JWT_REFRESH_SECRET`/`DATABASE_URL`
signalées si absentes en production, **sans bloquer** — certaines
routes ont leur propre repli documenté) + blocage explicite d'une seule
combinaison dangereuse : `DEMO_MODE=1` en `NODE_ENV=production` sans
`ALLOW_DEMO_IN_PRODUCTION=1` (opt-in nommé, même convention que
`E2E_RATE_LIMIT_BYPASS`).

**Réserve explicite** : ce module **n'est pas câblé** dans le cycle de
démarrage réel de l'application dans ce lot — aucun autre fichier
n'a été modifié pour l'importer (hors périmètre du Lot A tel que
scopé). La protection est complète, testée et prête, mais **inactive**
tant qu'aucun point d'entrée ne l'importe. À traiter dans un lot
séparé si le câblage est souhaité.

## 4. Tests ajoutés

- `lib/logger.test.ts` (3 tests) : rédaction des chaînes de connexion,
  des champs sensibles, non-altération d'un texte sans donnée sensible.
- `lib/config/env.test.ts` (6 tests) : configuration dev minimale
  acceptée, blocage `DEMO_MODE=1` sans opt-in, autorisation avec
  opt-in, `DEMO_MODE=0` jamais bloquant, variables critiques signalées
  (sans bloquer) en production, non exigées hors production.

## 5. Vérifications réelles (résultats complets)

| Vérification | Résultat |
|---|---|
| `tsc --noEmit` | ✅ 0 erreur |
| `next lint` | ✅ 0 warning |
| `vitest` (unit) | ✅ **203/203** (194 précédents + 9 nouveaux) |
| `test:integration` (`USE_TEST_DB=1`) | ✅ **18 fichiers, 68/68** (inchangé) |
| `npm run build` | ✅ succès |
| `test:e2e:isolated` (local) | ⚠️ 54 passed / 3 failed |
| Workflow CI | ✅ success |
| Workflow Integration | ✅ success |
| Workflow E2E (CI) | ⚠️ **54 passed / 3 failed** — identique au run local |
| Workflow Staging (migrate + deploy + smoke tests intégrés) | ✅ success |
| Smoke test Staging en direct (`/api/health`) | ✅ `200 {"status":"ok","db":"ok",...}` |
| Vérification live du correctif SSRF (`/_next/image?url=...`) | ✅ `400` (rejeté, comportement attendu) |

### Détail des 3 échecs E2E (local + CI, identiques)

`marketplace-delivery.spec.ts:14`, `tontine.spec.ts:22`,
`tontine.spec.ts:37` — chacun correspond individuellement à une
signature d'erreur déjà documentée comme préexistante dans
`TICKET_CI_E2E_FAILURES.md` (timing métier livraison ; violations de
mode strict Playwright sur les tontines). **Aucun des fichiers modifiés
par le Lot A** (`next.config.js`, `lib/logger.ts`, `lib/config/env.ts`,
`scripts/db-backup.mjs`) **n'est sur le chemin de code** de ces trois
tests (secrets/configuration vs. tontines/marketplace-livraison) — non-
régression confirmée par absence de chevauchement de code, cohérente
avec la flakiness déjà caractérisée (1 à 3 tests de cette famille par
run, variable).

## 6. Régressions et réserves

- **Aucune régression fonctionnelle constatée.**
- **Réserve** : `lib/config/env.ts` n'est pas encore actif (voir §3e) —
  la protection contre `DEMO_MODE=1` en production ne s'applique pas
  tant qu'aucun point d'entrée ne l'importe.
- **Hors périmètre, non traité (rappel)** : Lot B (environnement local
  = production sans garde ; clé Supabase Storage à portée totale ;
  nettoyage de `.env.local`) et Lot C (CSP `unsafe-inline`/`unsafe-eval`,
  absence de HSTS).

## 7. Conformité au périmètre

- ✅ Ledger, Wallet, Escrow, Payments, Tontines métier, Marketplace, KYC,
  AI : non touchés.
- ✅ P0.2 (sessions/tokens/cookies/refresh/révocation/`createSession`),
  P0.3 : non touchés.
- ✅ Aucune règle métier modifiée.
- ✅ Aucune mise à jour générale de dépendances (`zod` déjà présent,
  aucune nouvelle dépendance ajoutée).
- ✅ Aucun test existant modifié — uniquement des tests ajoutés.
- ✅ 1 seul commit cohérent pour le Lot A.

## 8. Commit et déploiement

- **Commit** : `eb8bc44b88a60460fac904d1b0dbe23da2f5d68a`
- **Push** : `origin main`
- **CI** : [`35650082174`](https://github.com/essotakougnadi-arch/kessia/actions/runs/35650082174) ✅
- **Integration** : [`35650082002`](https://github.com/essotakougnadi-arch/kessia/actions/runs/35650082002) ✅
- **E2E** : [`35650081965`](https://github.com/essotakougnadi-arch/kessia/actions/runs/35650081965) ⚠️ (54/57, non-régression confirmée)
- **Staging** : [`35650081958`](https://github.com/essotakougnadi-arch/kessia/actions/runs/35650081958) ✅ (migrate + deploy + smoke tests)
- **Staging en direct** : `https://kessia-staging.vercel.app/api/health` → `200`

## Verdict

**P1.9 (Lot A) = VALIDÉ.** Les 6 correctifs demandés sont en place,
vérifiés par des tests réels, et confirmés sans régression sur
l'ensemble de la chaîne de vérification (local + CI + déploiement
Staging + smoke tests + vérification live du correctif SSRF). Lot B et
Lot C restent explicitement hors périmètre, en attente d'une éventuelle
autorisation séparée.
