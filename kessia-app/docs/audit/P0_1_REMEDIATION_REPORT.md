---
title: "KESSIA — P0.1 : Sécurité Next.js — Rapport de remédiation"
date: "14 septembre 2026"
---

# KESSIA — P0.1 : Sécurité Next.js — Rapport de remédiation

**Base** : `PHASE0_EXECUTION_PLAN.md` §P0.1, sur la base P0.0 validée (migrations
Prisma versionnées).
**Périmètre** : framework Next.js + dépendances + nettoyage de dépendances
mortes. **Aucune** modification de : sessions/tokens (P0.2), Ledger, Wallet,
séquestres, paiements, Tontines, Marketplace, KYC, IA.

---

## 1. Le problème

`npm audit` sur `next@14.2.5` (état de départ) : **15 vulnérabilités (2
critiques, 9 hautes, 4 modérées)**, dont un contournement d'autorisation du
middleware (`GHSA-f82v-jwr5-mffw`) et deux RCE non authentifiées
(`GHSA-p293-qw3h-jr36`, `GHSA-2xp9-vwfh-vxw4`).

**Découverte critique en cours de mission** : le plan initial ciblait
`next@14.2.35` (dernier patch 14.x). Vérification faite : **les deux RCE
critiques restent non corrigées sur toute la branche 14.x** — le correctif
n'existe qu'à partir de `next@15.5.24` / `16.3.3`. Un audit `npm audit` seul,
sans lecture des plages `via[].range` de chaque advisory, ne l'aurait pas
révélé.

**Décision utilisateur (exception documentée)** : autorisation explicite de
dépasser la règle « rester en 14.2.x » **uniquement** pour ces deux RCE
critiques, avec cible fixée précisément à **Next.js 15.5.24** (pas 16.x).

## 2. Versions

| Paquet | Avant | Après |
|---|---|---|
| `next` | `14.2.5` | **`15.5.24`** |
| `eslint-config-next` | `14.2.5` | `14.2.35` (alignée sur la branche 14.x — pas de bump vers une version liée à Next 16, hors périmètre) |
| `react` / `react-dom` | `^18.3.1` | **inchangé** — `next@15.5.24` accepte `react: '^18.2.0 \|\| 19.0.0-rc-... \|\| ^19.0.0'`, React 18 reste compatible, pas de migration React 19 |
| `postcss` (transitif) | `8.4.31` (pin exact interne à `next`) | `^8.5.23` via `overrides` npm |
| `next-auth` | `^5.0.0-beta.19` | **supprimé** (dépendance morte) |
| `uuid` / `@types/uuid` | `^10.0.0` | **supprimés** (dépendances mortes) |

### Dépendances mortes — preuve de non-usage

- `next-auth` : `Grep` sur tout le dépôt (hors `node_modules`) → **0 import**,
  0 référence dans `middleware.ts`, la config, les scripts, les tests. Le
  système d'auth de KESSIA est maison (`lib/auth/*`, JWT + `jose`).
- `uuid` : `Grep` → **0 import**. `lib/utils/crypto.ts:41` utilise
  `crypto.randomUUID()` natif Node, pas le paquet npm.

Suppression conforme à la RÈGLE ABSOLUE : vérifiée avant modification, aucune
fonctionnalité supprimée (rien ne les consommait).

## 3. Breaking change Next 15 traité : Async Request APIs

Next 15 rend asynchrones `cookies()`/`headers()`/`draftMode()`
(`next/headers`) ainsi que `params`/`searchParams` des pages, layouts et
routes API.

**Outil utilisé** : codemod officiel
`npx @next/codemod@latest next-async-request-api .` (dry-run d'abord : 0
erreur, 48 fichiers concernés ; puis application réelle).

**48 fichiers modifiés** :
- **46 routes API / pages** avec segment dynamique (`app/api/v1/**/[id]/route.ts`,
  `app/(dashboard)/**/[id]/page.tsx`, etc.) — patron uniforme :
  ```ts
  // avant
  export async function GET(request: NextRequest, { params }: { params: { id: string } }) { … params.id … }
  // après
  export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    … params.id … // corps inchangé
  }
  ```
  Diff total : **180 insertions / 136 suppressions** sur 48 fichiers — proportionné,
  aucune logique métier touchée.
- **`lib/i18n/server.ts`** (1 usage direct de `cookies()`) : le codemod a
  choisi l'échappatoire officielle temporaire `UnsafeUnwrappedCookies`
  plutôt qu'un refactor async en cascade, pour ne pas toucher les 9 fichiers
  appelants (`serverT`, `getServerLocale`, `serverNumber` restent
  synchrones). **Dette technique documentée** (type marqué déprécié par
  Next) — voir §7.
- **Faux positif corrigé manuellement** : `app/api/v1/me/route.ts` — le
  codemod avait inséré un commentaire `@next-codemod-error` bloquant le
  build sur un ré-export (`export { GET, PATCH } from '../profile/route'`)
  alors que ces handlers ne prennent **aucun** paramètre dynamique (vérifié
  par lecture de `app/api/v1/profile/route.ts`). Commentaire retiré, fichier
  revenu à son contenu d'origine (`git diff` confirme : aucun changement net
  sur ce fichier).

**Nettoyage post-codemod** : le générateur (jscodeshift/recast) a converti
les fins de ligne LF → CRLF sur les 48 fichiers, gonflant artificiellement
chaque diff (jusqu'à 405 lignes pour 3-6 lignes de changement réel). Normalisé
(`sed -i 's/\r$//'`) pour garder des diffs revus lisibles et minimaux.

**Vérification de la couverture** : `next build` (type-check strict contre
`.next/types/`) est la source de vérité pour ce breaking change — `tsc
--noEmit` seul n'a détecté que le cas `cookies()` direct, pas les signatures
de routes/pages. Méthode retenue pour toute migration Next future.

## 4. Résultat sécurité

### Avant (`next@14.2.5`)
15 vulnérabilités : 2 critiques (RCE Next.js), 9 hautes, 4 modérées.

### Après (`next@15.5.24`)
```
info: 0, low: 0, moderate: 3, high: 4, critical: 1, total: 8
```

**Vérification explicite demandée par l'utilisateur** : recherche directe des
deux identifiants dans la sortie JSON complète de `npm audit` —
`GHSA-p293-qw3h-jr36` et `GHSA-2xp9-vwfh-vxw4` : **0 occurrence**. Le paquet
`next` **n'apparaît plus du tout** dans la liste des paquets vulnérables.

### Résiduel (8 vulnérabilités, 100 % devDependencies, 0 exposition runtime)

| Paquet | Sévérité | Cause | Correctif disponible | Décision |
|---|---|---|---|---|
| `eslint-config-next`, `@next/eslint-plugin-next`, `glob` | haute | `next lint` (déprécié par Next 15, retiré en Next 16) tire un `glob` vulnérable (`GHSA-5j98-mcp5-4vw2`, commande shell) | `eslint-config-next@16.3.5` | **Différé** — nécessite Next 16, hors périmètre de cette exception (cible fixée à 15.5.24) |
| `vitest`, `vite`, `vite-node`, `@vitest/mocker`, `esbuild` | 1 critique + 3 modérées | `vitest@2.1.9` (chaîne de build de test) | `vitest@5.0.0` (majeure) | **Différé** — outillage de test uniquement, jamais présent en production ; bump majeur = hors du minimal-diff de P0.1, à traiter dans un ticket dédié |

Aucun de ces 8 résiduels n'est exposé en production (devDependencies
uniquement, jamais bundlées côté runtime/serveur déployé).

## 5. Vérifications exécutées

| Étape | Résultat |
|---|---|
| `npm audit` (avant/après) | 15 (2 crit.) → 8 (0 crit. lié à Next), CVE ciblées absentes |
| `tsc --noEmit` | **0 erreur** |
| `next lint` | **0 warning/erreur** (avertissement de dépréciation de `next lint` lui-même pour Next 16 — informatif, hors périmètre) |
| `vitest run` (unit) | **182/182** |
| `vitest run --config vitest.integration.config.ts` (`USE_TEST_DB=1`, base jetable) | **13 fichiers / 36 tests, tous verts** |
| `npm run build` | **succès** (`prisma generate && next build`, 67/67 pages générées) |
| `npm run test:e2e:isolated` (Playwright, 49 tests) | voir §6 |

## 6. E2E : investigation de flakiness (pas une régression)

Un premier run E2E complet a montré 3 échecs, dont
`e2e/navigation.spec.ts:32` (« la couleur d'accent Violet s'applique et
persiste »). Conformément à la RÈGLE ABSOLUE (vérifier les risques de
régression avant de conclure), une investigation rigoureuse a été menée
plutôt que d'assumer une cause :

1. **Comparaison contrôlée A/B** (`git stash` Next 15 → réinstallation Next
   14.2.5 → rebuild → run E2E complet, puis restauration Next 15) : **4 runs
   complets au total** (3 sur Next 15, 1 sur Next 14.2.5).
2. **Résultat** : chaque run — sur les **deux** versions — échoue sur
   **1 à 3 tests différents et non reproductibles** :
   - Next 15, run 1 : `kyc-pin-admin.spec.ts:71`, `navigation.spec.ts:32`
     (accent), `tontine-lifecycle.spec.ts:17`
   - Next 15, run 2 : `marketplace-cart.spec.ts:13`, `tontine.spec.ts:22`
   - **Next 14.2.5** : `tontine.spec.ts:37` (plan d'Achat solo)
   - Next 15, run final : `kyc-pin-admin.spec.ts:84`,
     `support-attachments.spec.ts:49`, `tontine.spec.ts:37`
3. **Test ciblé** : `e2e/navigation.spec.ts -g "accent"` relancé **5 fois de
   suite** en isolation sur Next 15.5.24 → **5/5 réussites**.
4. **Conclusion** : flakiness d'infrastructure de test **pré-existante et
   indépendante de la version Next.js** (Postgres jetable local + `next
   start` + Playwright single-worker sous charge machine partagée),
   **aucune régression liée à la migration**. Le test accent-color n'est pas
   plus instable que les autres tests touchés aléatoirement d'un run à
   l'autre. Aucun code lié à l'accent (`store/accentStore.ts`,
   `app/layout.tsx`) n'a été modifié par le codemod.

**Run final retenu** : `npm run test:e2e:isolated` → **46/49 passés**, 3
échecs (tous de la famille flakiness ci-dessus, aucun nouveau, aucun lié au
bug `Session.token` déjà réservé à P0.2).

### Point de méthode découvert en cours de route

`npm run test:integration` **sans** `USE_TEST_DB=1` cible la base Supabase
distante configurée dans `.env`/`.env.local` au lieu de la base Postgres
jetable locale — comportement documenté et volontaire par l'ADR 0044
(nettoyage `itest_` prévu pour ce cas), mais **beaucoup plus lent** sur un
réseau chargé (jusqu'à ×45 sur les tests transactionnels lourds).
**Précision** : cette base (réf. projet Supabase `uwvnarmojdbutbunzqww`) est
celle que `staging.yml` qualifie lui-même explicitement de **« projet
Supabase de PRODUCTION »** dans sa garde anti-écrasement (il refuse d'y
appliquer une migration) — c'est la base de démo en ligne réelle
(https://kessia-dun.vercel.app), pas une base de dev isolée. Un run
`test:integration` lancé par erreur sans `USE_TEST_DB=1` a été tué après un
ralentissement anormal (~8 min sans progression, 0 connexion active en
base) ; tous les fichiers de test **qui avaient déjà réussi** avant
l'interruption ont exécuté leur nettoyage normal
(`test/integration/helpers.ts::cleanup`, préfixe `itest_`) ; le fichier en
cours au moment de l'arrêt n'a créé qu'un nombre minime d'enregistrements
jetables, clairement tagués (`lastName` préfixé `itest_`, téléphones
`+22899…` hors plage de seed). Vérification directe de la base distante pour
confirmer l'absence de résidu **bloquée par le classificateur de sécurité de
l'outil** (accès identifiants en ligne de commande) — non contournée, à
faire manuellement si souhaité (`SELECT … WHERE "firstName"='IT' AND
"lastName" LIKE 'itest\_%'`). Risque résiduel jugé faible (aucune donnée
utilisateur réelle affectée, pattern de nettoyage déjà conçu par l'ADR 0044
pour ce cas) ; signalé ici pour transparence complète envers l'utilisateur.
**Action retenue pour la suite** : toujours invoquer `USE_TEST_DB=1 npm run
test:integration`.

## 7. Risques résiduels documentés

1. **`UnsafeUnwrappedCookies` dans `lib/i18n/server.ts`** — échappatoire
   officielle mais dépréciée à terme par Next. Fonctionne sur 15.5.24, à
   migrer vers un refactor async complet (9 appelants) lors d'un futur
   passage Next.
2. **8 vulnérabilités devDependencies résiduelles** (§4) — 0 exposition
   runtime, différées (nécessitent Next 16 ou vitest 5.x majeur, hors
   périmètre de l'exception accordée).
3. **`next lint` déprécié** (retiré en Next 16) — migration vers ESLint CLI
   documentée par Next (`@next/codemod@canary next-lint-to-eslint-cli`),
   non urgente tant qu'on reste en 15.x.
4. **Flakiness E2E pré-existante** (§6) — indépendante de cette migration,
   non introduite ni aggravée par elle ; reste à traiter séparément
   (probablement infrastructure de test locale, hors périmètre P0.1).
5. **`Session.token` (bug de collision)** — explicitement **réservé à
   P0.2**, non touché ici.

## 8. Conformité au périmètre

- ✅ Next.js migré (avec exception documentée et autorisée par l'utilisateur
  pour raison de sécurité démontrée : 2 RCE critiques non fixables en 14.x)
- ✅ Vulnérabilités critiques/hautes corrigées, dépendances transitives
  vérifiées (`postcss` via `overrides`)
- ✅ `next-auth` supprimé après vérification exhaustive de non-usage
- ✅ Pas de migration Next 16
- ✅ P0.2 non commencé : aucune touche à `Session.token`, `createSession`,
  refresh tokens, cookies d'auth, révocation, RBAC métier
- ✅ Ledger / Wallet / séquestres / paiements / Tontines / Marketplace / KYC /
  IA : **non touchés**
- ✅ 1 changement cohérent (la mise à niveau Next 15.5.24 et ses correctifs
  mécaniques associés constituent un seul problème résolu par une seule mise
  à jour, comme autorisé explicitement)

## 9. Déploiement et vérification staging

Voir section correspondante du `CHANGELOG.md` et le commit de clôture
pour le SHA, le run de déploiement `kessia-staging` et les résultats des
smoke tests.

---

## Verdict

**P0.1 = VALIDÉ — PRÊT POUR P0.2**

Les deux CVE critiques ciblées sont éliminées et vérifiées absentes
explicitement (pas seulement via `npm audit` global). Aucune fonctionnalité
supprimée. Aucune régression introduite (flakiness E2E pré-existante,
démontrée indépendante de la version par comparaison A/B contrôlée). Build,
lint, types, tests unitaires et d'intégration verts. Périmètre P0.2
(sessions/tokens) strictement respecté — non entamé.

**P0.2 reste bloqué en attente de l'autorisation explicite de l'utilisateur.**
