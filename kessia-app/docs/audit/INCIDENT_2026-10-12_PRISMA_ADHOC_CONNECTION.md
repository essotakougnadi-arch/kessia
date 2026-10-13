# Incident — commande Prisma ad hoc connectée à un hôte distant non vérifié

**Date :** 2026-10-12 · **Gravité retenue :** modérée (lecture seule, hôte non vérifié) · **Statut :** documenté, correctif proposé, en attente d'autorisation avant toute nouvelle vérification de base de données.

Ce rapport documente précisément ce qui s'est passé, sans affirmer au-delà de ce que les preuves disponibles permettent d'établir.

## 1. Ce qui est établi avec certitude

- **Commande exécutée** (texte exact, reconstitué depuis l'historique de la session) :
  ```
  DATABASE_URL="postgresql://postgres@127.0.0.1:5433/kessia_p0_test" npx prisma migrate status
  ```
- **Variable remplacée** : `DATABASE_URL` uniquement, explicitement fixée à `127.0.0.1:5433` (cluster de test local).
- **Variable NON remplacée** : `DIRECT_URL` — aucune valeur n'a été passée pour cette variable dans la commande.
- **Répertoire de travail** : `kessia-app/`, branche `test/authz-and-invariants` (HEAD au commit `826e3c7` au moment de l'exécution).
- **Outil utilisé** : appel direct au CLI (`npx prisma migrate status`), **pas** via un script npm existant (`db:push`/`db:migrate`/`db:test:reset`/etc.) — aucun des garde-fous existants (`guard-db-command.mjs`, `db-test-reset.mjs`) n'a donc été invoqué.
- **Fenêtre temporelle** : entre 18:04:09 et 18:05:41 UTC le 2026-10-12 (encadrée par les horodatages de deux suites de tests exécutées immédiatement avant/après dans la même session ; l'horodatage exact de cette commande précise n'a pas été capturé par la commande elle-même, qui n'émet pas de date).
- **Sortie retournée par la commande** :
  ```
  Prisma schema loaded from prisma\schema.prisma
  Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-1-eu-west-1.pooler.supabase.com:5432"

  4 migrations found in prisma/migrations

  Database schema is up to date!
  ```
- **Hôte effectivement contacté** : `aws-1-eu-west-1.pooler.supabase.com:5432` (pooler Supabase, mode session). Le nom de base affiché est `postgres` (nom par défaut Supabase — n'identifie pas le projet à lui seul).

## 2. Ce qui est établi avec un haut degré de confiance, mais pas une certitude absolue

- **Il s'agit très probablement de l'environnement Supabase de ce dépôt** (il n'existe, dans toute cette session, aucune trace d'un second projet Supabase configuré). Mais la sortie de la commande ne montre pas l'identifiant de projet (partie utilisateur de l'URL, masquée par Prisma) — l'appartenance exacte au marqueur de production déjà connu (`PRODUCTION_MARKERS` dans `guard-db-command.mjs`) n'a **pas** été vérifiée par cette sortie seule.
- **Cause du comportement** : `DIRECT_URL` n'étant pas fournie dans l'environnement de la commande, Prisma est retombé sur sa propre résolution native (`process.env`, puis `.env` du projet) — exactement le mécanisme identifié comme cause racine de l'incident de production du 2026-10-12 documenté dans `scripts/db-test-reset.mjs` (`⚠️ INCIDENT 2026-10-12 : … Correctif : DIRECT_URL est désormais TOUJOURS résolue et neutralisée explicitement`). Cette commande ad hoc n'est pas passée par ce correctif puisqu'elle ne l'invoque pas.

## 3. Ce qui N'EST PAS établi — ne pas sur-affirmer

- **Aucune modification n'a été confirmée**, mais l'absence de modification n'est pas non plus prouvée au-delà de ce que documente le comportement officiel de la commande : `prisma migrate status` est documentée par Prisma comme une commande de lecture seule — elle compare le contenu du dossier `prisma/migrations` local à la table interne `_prisma_migrations` de la base ciblée, sans appliquer de migration ni écrire de donnée applicative. La sortie obtenue (« 4 migrations found… Database schema is up to date! ») est cohérente avec ce comportement documenté. **Mais** : je n'ai accès à aucun journal serveur indépendant (logs Supabase) pour corroborer cela — seule la sortie du client CLI a été observée.
- **Données accessibles** : par la conception documentée de la commande, uniquement les métadonnées de la table `_prisma_migrations` (noms de migration, checksums, dates d'application) de la base ciblée — pas les tables applicatives (utilisateurs, wallets, etc.). Ceci reste une inférence à partir du comportement documenté de l'outil, pas une vérification octet-par-octet.
- **Correspondance avec le marqueur de production connu** : non vérifiée (voir §2).
- Aucun identifiant (nom d'utilisateur, mot de passe) n'a été observé ni n'est reproduit dans ce rapport — Prisma ne les affiche jamais dans sa sortie `migrate status`.

## 4. Cause structurelle (analyse du code, lecture uniquement — aucune commande exécutée pour cette section)

Inspection de `scripts/guard-db-command.mjs`, `scripts/db-test-reset.mjs` et des scripts `package.json` :

| Constat | Détail |
|---|---|
| **Aucun script npm ne couvre les commandes Prisma de lecture** (`migrate status`, etc.) | `package.json` ne définit que `db:push`/`db:migrate`/`db:migrate:deploy`/`db:studio`/`db:seed`/`db:test:reset` — toutes protégées. Il n'existe **aucun** `db:test:status` ou équivalent. Un développeur (ou un agent) voulant juste *vérifier* l'état d'une base est donc naturellement poussé vers `npx prisma migrate status` tapé directement. |
| **Un appel CLI direct contourne entièrement `guard-db-command.mjs`** | Cette garde est un script wrapper — elle ne protège que les invocations qui passent explicitement par elle (`node scripts/guard-db-command.mjs prisma …`). Rien dans ce dépôt n'empêche un appel direct à `npx prisma <sous-commande>`. C'est exactement ce qui s'est produit ici. |
| **`guard-db-command.mjs` est une DENYLIST, pas une ALLOWLIST** | `isProductionDatabaseUrl()` ne refuse qu'un marqueur de production déjà connu et codé en dur. Elle ne vérifie jamais positivement que la cible EST la base de test attendue. Une base distincte (nouveau projet Supabase, environnement de staging jamais ajouté au marqueur) passerait ce garde-fou sans être détectée. |
| **`db-test-reset.mjs` (déjà corrigé sur cette branche) résout bien `DIRECT_URL` explicitement**, mais cette résolution est locale à ce seul script | Toute nouvelle commande Prisma ad hoc, ou tout nouveau script futur qui oublierait de reproduire ce même soin, répéterait le même défaut — rien ne centralise cette garantie. |
| **Confirmation inquiétante, par lecture seule (`git show`, aucune exécution)** | Le correctif `DIRECT_URL` de `db-test-reset.mjs` n'existe QUE sur la branche `fix/db-test-reset-production-guard`. Il est **absent de `main`, de `test/authz-and-invariants` et de `feat/seller-verification-and-miaride-tracking`** — confirmé par `git show <branche>:kessia-app/scripts/db-test-reset.mjs \| grep -c DIRECT_URL` → 0 sur les trois, 14 sur la branche corrigée. **Tant que cette PR n'est pas fusionnée, `npm run db:test:reset` reproduirait aujourd'hui l'incident de production original sur `main`.** C'est un rappel direct de l'urgence de cette fusion, indépendant du présent incident.

## 5. Correctif proposé — PAS encore câblé, PAS encore exécuté contre aucune base

Nouveau module `scripts/require-local-db.mjs` (ALLOWLIST, complémentaire à la DENYLIST existante) :

- Exige `DATABASE_URL` **et** `DIRECT_URL` tous deux fournis explicitement (aucun repli silencieux accepté).
- Exige qu'ils soient strictement identiques entre eux.
- Exige qu'ils correspondent strictement à la valeur documentée dans `.env.test`.
- Exige, en défense en profondeur, un hôte loopback (`127.0.0.1`/`localhost`) — même si `.env.test` lui-même était un jour mal configuré.
- Peut être appelée par n'importe quel wrapper Node futur avant de lancer Prisma — mais ne protège, par elle-même, **aucune** invocation qui ne l'appelle pas explicitement (voir « Limite structurelle » ci-dessous : ce n'est PAS une protection automatique et universelle).

Preuve par tests **entièrement simulés** (`scripts/require-local-db.test.ts`, 10 tests, `node:fs` moqué, aucune connexion réseau, aucun process Prisma lancé) : couvre exactement le scénario de cet incident (`DATABASE_URL` fournie, `DIRECT_URL` absente → refusé), plus les variantes (URLs différentes, ne correspondant pas à `.env.test`, hôte non-loopback, `.env.test` absent, cas valides). **10/10 verts.** `tsc --noEmit` et `eslint` propres.

**Ce que ces 10 tests prouvent, exactement — ni plus ni moins** : que la fonction `assertLocalTestPair()`, SI elle est appelée avec des arguments donnés, renvoie la bonne décision (accepté/refusé) selon les règles ci-dessus. Ils ne prouvent PAS, et ne peuvent pas prouver, qu'elle sera effectivement appelée avant une commande Prisma donnée — c'est une question de câblage (§ »Câblage proposé »), pas de logique interne.

### Limite structurelle — à ne jamais présenter comme résolue par ce correctif

**Ce correctif, même entièrement câblé selon la proposition ci-dessous, ne peut PAS empêcher une commande Prisma tapée directement dans un terminal.** C'est exactement le mécanisme de cet incident : une commande ad hoc, jamais passée par un script protégé. Un nouveau script `db:test:status` offrirait un chemin sûr *disponible*, mais rien n'empêche quiconque (humain ou agent, y compris moi-même dans une session future) de taper `npx prisma migrate status` directement et de contourner ce chemin comme `guard-db-command.mjs` a été contourné cette fois-ci. Réduire ce risque à la source demanderait un mécanisme hors du niveau applicatif de ce dépôt (restriction réseau sur le poste/l'environnement d'exécution, identifiants de production absents de toute machine de développement, hook shell, etc.) — **aucun de ces mécanismes n'est proposé ici** ; ce correctif réduit la probabilité de récidive si la convention « toujours passer par un script `db:*` » est respectée, il ne l'élimine pas structurellement.

### Câblage proposé (texte ci-dessous — PAS appliqué, en attente d'autorisation)

```diff
--- a/kessia-app/package.json
+++ b/kessia-app/package.json
@@
   "db:test:reset": "node scripts/db-test-reset.mjs",
+  "db:test:status": "node scripts/run-local-only.mjs prisma migrate status",
```

Un petit script `scripts/run-local-only.mjs` (à écrire si autorisé) appellerait `requireLocalTestPairOrExit()` avant de relayer la commande vers `execFileSync`, en réutilisant le même motif que `guard-db-command.mjs`. `db-test-reset.mjs` pourrait à terme déléguer sa propre vérification à `assertLocalTestPair()` pour éviter la duplication de logique entre les deux fichiers — proposé, pas fait, pour limiter le changement à ce qui a été demandé.

**Recommandation complémentaire (documentation, pas de code)** : ajouter une règle explicite (ex. dans `docs/development/testing.md`) : *« Ne jamais taper `npx prisma <commande>` directement. Toujours passer par un script `db:*` protégé ; en créer un nouveau si celui qu'il vous faut n'existe pas encore. »*

## 6. Ce qui N'A PAS été fait suite à cet incident (conformément à l'instruction reçue)

- Aucune commande Prisma supplémentaire.
- Aucune connexion testée, vers aucune base (locale ou distante).
- Aucun secret consulté, modifié ou affiché.
- Aucune action en production.
- Le correctif proposé n'a été ni câblé dans `package.json`, ni exécuté contre quoi que ce soit.

## 7. Décision requise du propriétaire avant de poursuivre

- Autoriser (ou non) le câblage du correctif proposé (§5) et son adoption comme chemin obligatoire pour toute vérification locale future.
- Autoriser (ou non) une nouvelle vérification de l'état de la base de test locale (`127.0.0.1:5433`) — même par ce nouveau correctif — avant de reprendre les tâches d'intégration de cette session.
- Indiquer si une vérification côté Supabase (logs de connexion autour de la fenêtre 18:04–18:06 UTC le 2026-10-12) est souhaitée pour corroborer indépendamment ce rapport.
