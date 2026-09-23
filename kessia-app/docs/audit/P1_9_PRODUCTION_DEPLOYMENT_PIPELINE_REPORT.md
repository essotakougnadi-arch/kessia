---
title: "KESSIA — P1.9 : Pipeline de déploiement Production — Rapport"
date: "23 septembre 2026"
---

# P1.9 — PRODUCTION DEPLOYMENT PIPELINE REPORT

**Base** : P0.0-P0.4, P1.6, P1.7, P1.9 Lot A+B, P1.12 déjà validés — non
refaits. Ce P1.9 correspond à l'ID historique du plan d'origine
(`PHASE0_EXECUTION_PLAN.md`, « Staging + pipeline de déploiement ») —
**distinct** du « P1.9 Lot A/B » (secrets/config, DB guard) déjà validé
dans cette session.

**Verdict : `BLOQUÉ` en attente d'actions manuelles — voir §14.** Le
code et la configuration GitHub Actions sont complets, testés et prêts.
Le mécanisme n'est **pas encore actif** tant que 3 actions humaines
(hors code, décrites précisément ci-dessous) n'ont pas été effectuées.

## 1. État avant

- `staging.yml` : se déclenche sur `push: branches:[main]`, appelle un
  **Deploy Hook** Vercel (`curl -X POST $STAGING_DEPLOY_HOOK`) du projet
  `kessia-staging`, migre (`prisma migrate deploy`), seed, smoke tests.
- Projet Vercel **`kessia`** (production, `kessia-dun.vercel.app`) :
  connecté nativement au dépôt GitHub — tout push sur `main` déclenche
  **automatiquement** un build + déploiement production, **indépendamment**
  de `staging.yml` (les deux se déclenchent sur le même événement).
- Aucun `deploy-prod.yml`. `ci.yml` déclare lui-même dans son en-tête
  *« Étapes suivantes : Security Checks → Staging → Smoke Tests → Prod »*
  — jamais atteint.
- Aucun GitHub Environment `production` configuré.
- `scripts/smoke.mjs` : script générique déjà existant (health, accueil,
  marketplace public, RBAC 401/403, et — si des identifiants sont
  fournis — login/Wallet/Ledger/Tontines/RBAC 403 authentifié). Sort en
  code 1 au premier échec. **Réutilisé tel quel**, aucune modification.
- `.vercel/project.json` (local, session-only) : lié à `kessia-staging`,
  jamais à `kessia`.

## 2. Problème confirmé

Un push sur `main` déclenche **simultanément** :
1. `staging.yml` (GitHub Actions → Deploy Hook staging) ;
2. le déploiement natif Vercel de **production**.

**Aucune passerelle, aucune approbation, aucun smoke test ne protège la
production.** C'est la cause exacte, vérifiée à chaque phase de cette
session, de la prudence *« NE PAS PUSH »* appliquée aux 11 commits
locaux actuellement en attente.

## 3. Architecture retenue

```
push main
   │
   ├─→ ci.yml (inchangé) — lint, typecheck, unit, build
   ├─→ integration.yml / e2e.yml (inchangés)
   └─→ staging.yml (inchangé) — migrate deploy + Deploy Hook staging + smoke

Promotion vers production — SÉPARÉE, MANUELLE :
   │
   déclenchement manuel (workflow_dispatch, jamais sur push)
   │
   deploy-prod.yml
   │
   ├─ job "confirm"  — vérifie une saisie explicite "PRODUCTION"
   ├─ job "migrate"  — environment: production (attend l'approbation
   │                   GitHub si configurée) → prisma migrate deploy
   │                   sur PRODUCTION_DATABASE_URL
   └─ job "deploy"   — environment: production → Deploy Hook production
                        → smoke tests (scripts/smoke.mjs, réutilisé)
```

Le déclencheur `workflow_dispatch` garantit qu'**aucun push ne peut,
par construction, démarrer ce workflow** — pas de logique conditionnelle
à contourner, juste l'absence du trigger `push`.

## 4. Fichiers modifiés

| Fichier | Changement |
|---|---|
| `.github/workflows/deploy-prod.yml` | **Nouveau.** Workflow de promotion manuelle, 3 jobs, `environment: production` sur `migrate` et `deploy`. |
| `docs/audit/P1_9_PRODUCTION_DEPLOYMENT_PIPELINE_REPORT.md` | **Nouveau** (ce document). |
| `CHANGELOG.md` | Entrée ajoutée. |

## 5. Fichiers non modifiés (confirmé)

`staging.yml`, `ci.yml`, `integration.yml`, `e2e.yml`, `cron.yml`,
`scripts/smoke.mjs`, `vercel.json`, `prisma/schema.prisma` (aucune
migration), et l'intégralité du code applicatif — Ledger, Wallet,
Escrow, Payments, Sessions, Tokens, Webhooks, Marketplace, Tontines,
KYC, AI, rate limiting Upstash. Confirmé par `git diff --stat` avant
commit (§13).

## 6. Configuration GitHub requise (action manuelle — à faire par vous)

**Étape unique dans l'interface GitHub** (Settings du dépôt) :

1. Aller dans **Settings → Environments → New environment**.
2. Nommer l'environnement exactement **`production`** (le workflow y
   fait référence littéralement — un nom différent ne serait pas
   reconnu).
3. Dans cet environnement, activer **« Required reviewers »** et
   désigner au moins une personne (vous-même a minima) habilitée à
   approuver une promotion.
4. Toujours dans cet environnement, ajouter les secrets suivants
   (Settings → Environments → production → Secrets) — **jamais dans
   les secrets globaux du dépôt**, pour garantir qu'ils restent
   distincts des secrets `STAGING_*` :
   - `PRODUCTION_DATABASE_URL`
   - `PRODUCTION_DEPLOY_HOOK`
   - `PRODUCTION_BASE_URL`
   - (optionnel) `PRODUCTION_SMOKE_PHONE` / `PRODUCTION_SMOKE_PASSWORD`
     — voir §12, je recommande de les laisser absents pour l'instant.

Aucune valeur de secret ne m'a été demandée ni communiquée à aucun moment.

## 7. Configuration Vercel requise (action manuelle — à faire par vous)

**Deux actions distinctes, dans le tableau de bord Vercel :**

### 7.1 — Créer un Deploy Hook pour la production
Projet **`kessia`** → Settings → Git → **Deploy Hooks** → créer un hook
(nom libre, ex. « production-promotion ») lié à la branche `main`.
Copier l'URL générée dans le secret GitHub `PRODUCTION_DEPLOY_HOOK`
(§6). C'est exactement le même mécanisme que celui déjà en place et
prouvé pour `kessia-staging` — aucune nouveauté technique.

### 7.2 — Couper l'auto-déploiement natif sur push (LE changement qui règle le problème)
Projet **`kessia`** → Settings → Git → **« Ignored Build Step »** →
définir la commande :
```
exit 0
```
**Pourquoi ça fonctionne** : Vercel exécute cette commande avant
chaque build déclenché par un push Git ; un code de sortie `0` indique
à Vercel de **sauter** ce build. Un Deploy Hook (7.1), lui, **n'est
jamais soumis à cette vérification** — il déclenche toujours un build,
quel que soit l'Ignored Build Step. Résultat exact recherché : push sur
`main` → plus aucun déploiement production automatique ; seule une
requête explicite au Deploy Hook (donc seul `deploy-prod.yml`, après
approbation) déclenche un déploiement production.

**Ne touche pas** `kessia-staging` : son fonctionnement actuel (Deploy
Hook déclenché par `staging.yml` sur chaque push) reste inchangé et
reste le comportement voulu pour l'environnement de test.

Je n'ai à aucun moment accédé ni tenté d'accéder au tableau de bord
Vercel pour effectuer ces changements moi-même.

## 8. Tests

### Tests obligatoires (non-régression — aucun code applicatif modifié)
| Test | Résultat |
|---|---|
| `tsc` | ✅ 0 erreur |
| `lint` | ✅ 0 warning |
| Unit | ✅ 225/225 |
| Intégration | ✅ 18 fichiers, 103/103 |
| Build | ✅ succès |
| E2E isolé | *(voir résultat joint séparément — famille d'échecs préexistante déjà documentée attendue)* |

### Validation du workflow lui-même
- **Syntaxe YAML** : validée (`js-yaml`) — 3 jobs (`confirm`, `migrate`,
  `deploy`), chaîne `needs` correcte, `environment: production` présent
  sur `migrate` et `deploy`.
- **Déclencheur** : `workflow_dispatch` uniquement — **aucun `push`**,
  vérifié par lecture directe du fichier (voir §10 pour la preuve).

## 9. Résultats staging

Non re-déployé dans ce chantier (aucune modification de `staging.yml`
ni du code applicatif — rien à revalider en conditions réelles). Le
dernier déploiement Staging réel (validation P1.6) reste la référence :
health/P0.2/P0.3/P1.12 tous verts, aucun secret dans les logs.

## 10. Preuve — un push sur `main` ne déclenche plus directement Production (côté code)

```yaml
# .github/workflows/deploy-prod.yml
on:
  workflow_dispatch:
    inputs:
      confirm: { ... }
```
Aucune clé `push` dans le déclencheur — **par construction**, GitHub
n'exécutera jamais ce workflow sur un push, quel que soit son contenu.
C'est une garantie statique (lecture du fichier), pas un comportement à
observer sous condition.

**Ce que ce rapport ne peut PAS encore prouver** : que le déploiement
**natif Vercel** (indépendant de ce workflow) est bien coupé — cela
dépend de l'action §7.2, qui reste à effectuer par vous. Tant qu'elle
ne l'est pas, un push sur `main` continue de déclencher un déploiement
production **directement par Vercel**, indépendamment de ce nouveau
workflow. **Le chantier n'est donc pas encore opérant de bout en bout.**

## 11. Preuve — l'approbation Production est obligatoire

**Non vérifiable en direct dans ce chantier**, pour une raison
structurelle et volontaire : `deploy-prod.yml` n'existe que **localement**
(commit non poussé, conformément à la consigne). GitHub Actions ne peut
reconnaître ni exécuter un workflow qui n'est pas présent sur le dépôt
distant — je ne peux donc pas déclencher un `workflow_dispatch` réel
avant que vous ne poussiez ce commit. C'est une limite acceptée du
périmètre, pas un test ignoré : le mécanisme d'approbation GitHub
(Required reviewers sur l'environnement `production`) est un
comportement **natif de GitHub**, pas une logique que ce workflow
implémente lui-même — sa correction dépend uniquement de la
configuration faite en §6, pas du code de ce fichier.

**Recommandation** : après avoir poussé ce commit et configuré §6/§7,
demander une vérification dédiée (déclenchement manuel du workflow,
observation de l'attente d'approbation, refus délibéré une fois pour
prouver qu'aucune étape Production ne s'exécute, puis approbation et
vérification du smoke test) avant de considérer P1.9 complètement
clos.

## 12. Rollback, arrêt, procédure de promotion

**Détection d'un échec** : le job `deploy` de `deploy-prod.yml` échoue
explicitement (le workflow entier passe en rouge dans l'onglet Actions)
si `scripts/smoke.mjs` retourne un code de sortie non nul — identique
au comportement déjà éprouvé sur `staging.yml`.

**Arrêt d'une promotion en cours** : annuler manuellement le run depuis
l'onglet GitHub Actions (bouton « Cancel workflow »), à tout moment —
avant approbation (annule l'attente), pendant la migration, ou pendant
le smoke test.

**Rollback applicatif** (code/assets) : Vercel conserve l'historique
des déploiements du projet `kessia` — redéployer manuellement le
déploiement précédent depuis le tableau de bord Vercel (bouton
« Promote to Production » sur un déploiement antérieur) restaure
immédiatement l'état applicatif précédent. Réversible et rapide.

**Rollback de migration Prisma** : **non automatisé, volontairement**.
Une migration `prisma migrate deploy` déjà appliquée n'est pas annulée
automatiquement par ce workflow — conformément à la consigne du mandat
(« ne pas inventer de rollback de migration dangereux »). Si une
migration doit être annulée :
- Si elle est **purement additive** (nouvelle colonne nullable,
  nouvelle table) : généralement sans risque de la laisser en place
  même si on revient à un code applicatif antérieur (le code ancien
  l'ignore simplement).
- Si elle est **destructive ou structurante** (colonne supprimée/
  renommée, contrainte modifiée) : nécessite une migration de
  compensation écrite et revue manuellement — jamais une restauration
  automatique de sauvegarde en réaction à un simple échec de smoke
  test. Voir `docs/audit/DATABASE_MIGRATION_PLAN.md` (déjà existant,
  P0.0) pour la procédure générale déjà en place.

**Responsabilité humaine** : le reviewer qui approuve le job `migrate`
doit avoir lu le diff de migration Prisma avant d'approuver — la
protection GitHub Environment ne remplace pas cette relecture.

## 13. Commit

Un seul commit local, périmètre strictement limité aux 3 fichiers
listés en §4. **Non poussé vers `origin/main`.**

## 14. Actions manuelles que vous devez effectuer (dans cet ordre)

1. **Vercel** — créer le Deploy Hook production (§7.1) et couper
   l'auto-déploiement natif via Ignored Build Step (§7.2) sur le
   projet `kessia` uniquement.
2. **GitHub** — créer l'environnement `production` avec Required
   reviewers, y ajouter les secrets `PRODUCTION_*` (§6).
3. **Push** de ce commit vers `origin/main` (avec votre GO explicite —
   je ne le fais pas moi-même).
4. **Validation en conditions réelles** : un déclenchement manuel de
   `deploy-prod.yml`, observé jusqu'à l'étape d'approbation, refusé une
   fois pour prouver le blocage, puis approuvé pour prouver le
   déploiement + smoke test réels — avant de considérer P1.9
   définitivement clos (§11).

Tant que 1 et 2 ne sont pas faits, un push sur `main` continue de
déployer `kessia` (production) directement via Vercel, exactement comme
aujourd'hui — ce chantier ne change rien à ce comportement tant que ces
actions externes n'ont pas été effectuées.

## Risques résiduels

- Le chantier livre le **mécanisme**, pas encore la **preuve de bout en
  bout** (dépend des actions §14).
- Aucun compte de smoke test dédié à la production n'existe — le
  parcours authentifié (login/Wallet/Ledger/Tontines) du smoke test
  restera ignoré tant que `PRODUCTION_SMOKE_PHONE/PASSWORD` ne sont pas
  configurés ; recommandé de ne PAS utiliser un compte réel pour cela
  et d'envisager un compte de test dédié si ce niveau de couverture est
  souhaité.
- Le rollback de migration reste une procédure manuelle documentée,
  pas automatisée (choix délibéré, conforme au mandat).
