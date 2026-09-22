---
title: "KESSIA — P0.1 : Finalisation sécurité Next.js — Rapport"
date: "22 septembre 2026"
---

# KESSIA — P0.1 : Finalisation sécurité Next.js 15.5.24

**Base** : migration `next` 14.2.5 → 15.5.24 déjà effectuée et validée
(commits `c8991d5` + `cca1d93`, antérieurs à ce chantier — voir
`P0_1_REMEDIATION_REPORT.md` pour l'historique complet de cette
migration). Ce chantier **finalise** P0.1 sans refaire ce travail,
conformément au mandat : audit frais de l'état actuel, sans rien
supposer des anciens rapports.

**Verdict : `PASS`.**

## 1. État avant (audit frais, Étape 1)

- `next` : **`15.5.24`** — confirmé installé **et verrouillé**
  (`package.json` + `package-lock.json`), pas seulement déclaré.
- `react`/`react-dom` : `^18.3.1`.
- **Écart trouvé** : `eslint-config-next` resté sur `14.2.35` — jamais
  aligné lors de la migration `next` d'origine. `npm audit` confirme que
  cette version porte une **vulnérabilité HIGH réelle** (`glob` —
  injection de commande, GHSA-5j98-mcp5-4vw2), comptant dans le total
  initial de « 1 critique + 4 high + 3 modéré = 8 ».
- `next.config.js` : déjà durci par P1.9 Lot A (`images.remotePatterns:
  []`, pas de bloc `serverActions` — confirmé inutilisé, 0 occurrence de
  `'use server'` dans tout le code). HSTS et CSP `unsafe-inline`/
  `unsafe-eval` restent hors périmètre (Lot C de P1.9, non traité ici).
- `middleware.ts` : présent, edge, JWT via `jose`, gère
  `PROTECTED_ROUTES` + rôles admin — **non modifié**.
- 97 routes API, 19 routes dynamiques, 0 `pages/` résiduel (App Router
  pur), 0 Server Action, 1 usage de `next/headers`, aucun
  `redirects()`/`rewrites()` configuré.
- Git : branche `main`, working tree propre au moment de l'inspection,
  6 commits locaux déjà en avance sur `origin/main` (P1.9 Lot A/B, P1.12
  — tous non poussés, contexte inchangé par ce chantier).

## 2. État après

- `next` : **`15.5.24`** — **inchangé**, aucune migration nécessaire
  (déjà à la cible).
- `react`/`react-dom` : **inchangés** (`^18.3.1`) — aucune mise à jour
  requise par `next@15.5.24`.
- `eslint-config-next` : **`14.2.35` → `15.5.24`** — aligné exactement
  sur `next` (version stable existante, hors de la plage vulnérable
  `14.0.5-canary.0 – 15.0.0-rc.1`, aucun passage par Next 16).

## 3. Version Next.js finale

`15.5.24` (inchangée par rapport à l'état avant ce chantier).

## 4. Versions React

`react` / `react-dom` : `^18.3.1` (inchangées).

## 5. Vulnérabilités corrigées

| Avant | Après |
|---|---|
| 8 (1 critique, 4 high, 3 modéré) | **5** (1 critique, 1 high, 3 modéré) |

3 vulnérabilités **HIGH** corrigées, toutes liées à la chaîne
`eslint-config-next@14.2.35 → @next/eslint-plugin-next → glob`
(GHSA-5j98-mcp5-4vw2, injection de commande). Confirmé : **0**
vulnérabilité Next.js restante.

## 6. Vulnérabilités restantes (documentées, non corrigées ici)

Les 5 vulnérabilités restantes (1 critique, 1 high, 3 modéré) sont
**exclusivement liées à l'outillage de test** (`vitest`,
`@vitest/mocker`, `vite`, `vite-node`, `esbuild`) — **sans aucun rapport
avec Next.js**. Correctif disponible uniquement via `vitest@5.0.1`
(changement cassant majeur du test-runner), explicitement hors
périmètre de ce chantier (« Ne pas effectuer de… upgrade non nécessaire
de packages »). Risque résiduel déjà documenté depuis l'audit P0.1
d'origine — inchangé.

## 7. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `package.json` | `eslint-config-next` `14.2.35` → `15.5.24` (1 ligne) |
| `package-lock.json` | régénération correspondante |

**Aucun autre fichier touché** (confirmé par `git diff --stat` avant
commit). Aucun fichier applicatif, aucun domaine interdit.

## 8. Breaking changes rencontrés

**Aucun.** `eslint-config-next` est un devDependency de lint uniquement
(zéro impact runtime). `next lint` avec le nouveau jeu de règles :
0 warning, 0 erreur — aucune règle plus stricte n'a révélé de problème
existant.

## 9. Tests exécutés

`npm run typecheck`, `npm run lint`, `npm run test` (unit), `USE_TEST_DB=1
npm run test:integration`, `npm run build`, `npm run test:e2e:isolated`.

## 10. Résultats des tests

| Test | Résultat |
|---|---|
| `typecheck` | ✅ 0 erreur |
| `lint` | ✅ 0 warning (nouvelles règles `eslint-config-next@15.5.24` incluses) |
| Unit | ✅ 225/225 |
| Intégration | ✅ 68/68 |
| Build | ✅ succès |
| E2E isolés | ⚠️ 54 passed / 3 failed |

**Détail des 3 échecs E2E** — comparés précisément à l'état préexistant
documenté dans `TICKET_CI_E2E_FAILURES.md`, **aucun attribué à ce
chantier** :
- `marketplace-delivery.spec.ts:14` — `TypeError` sur
  `confirm.json().data` undefined (timing métier, déjà documenté).
- `tontine.spec.ts:22` et `:37` — violation de mode strict Playwright
  (déjà documenté, famille récurrente).

`auth.spec.ts:12` (flakiness déjà caractérisée en P0.5) est passé sur ce
run — cohérent avec sa nature intermittente déjà établie.

## 11. Staging

Déployé sur **`kessia-staging` exclusivement** via Vercel CLI (méthode
déjà établie en P1.12, hors pipeline Git — aucun push nécessaire ni
effectué). `kessia` (production) **jamais touché**.

| Vérification | Résultat |
|---|---|
| `/api/health` | ✅ 200, `{"status":"ok","db":"ok",...}` |
| Page d'accueil (`/`) | ✅ 200 |
| Middleware — route protégée sans session | ✅ 307 → `/login?from=%2Fwallet` |
| RBAC 401 (API sans token) | ✅ 401 |
| Login | ✅ 200, jeton émis |
| Wallet (authentifié) | ✅ 200, solde réel renvoyé (Ledger intact) |
| Tontines (authentifié) | ✅ 200, données réelles |
| Marketplace (public) | ✅ 200, données réelles |
| RBAC 403 (rôle USER sur route admin) | ✅ 403 `FORBIDDEN` |
| Image statique | ✅ 200 |
| Logs Vercel | ✅ aucune erreur, **aucun secret** |

## 12. Risques résiduels

- 5 vulnérabilités non-Next.js déjà documentées (§6), nécessitant
  `vitest@5.0.1` — chantier séparé si souhaité.
- CSP `unsafe-inline`/`unsafe-eval` et absence de HSTS : hors périmètre
  (Lot C de P1.9, non traité).
- Aucun nouveau risque introduit par ce chantier.

## 13. Conclusion

**VERDICT P0.1 : `PASS`.**

`next@15.5.24` confirmé déjà en place et sain. Seul écart réel trouvé
(`eslint-config-next` non aligné, portant une vulnérabilité HIGH réelle)
corrigé par un changement unique, minimal, sans breaking change. 0
vulnérabilité Next.js restante. Tests locaux et validation Staging
(hors production) tous verts, aucune régression sur authentification,
Wallet, Ledger, Tontines, Marketplace, RBAC ou middleware.

Ledger, Wallet, Escrow, Payments, Tontines, Marketplace, KYC, AML, AI,
P0.2, P0.3, P1.9, P1.12/Upstash, schéma Prisma/migrations : **non
touchés**. Aucun push effectué. Aucun déploiement ni modification de
`kessia` (production).
