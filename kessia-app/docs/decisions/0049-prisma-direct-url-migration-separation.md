# ADR 0049 — `directUrl` Prisma : séparation technique runtime / migration

**Statut :** accepté · **Date :** 2026-10-01
**Contexte :** P1.11 (pooling), suite directe à l'ADR 0002 (pooler Supabase)
et à l'ADR 0048 (migrations versionnées), qui identifiaient déjà ce gap
sans le formaliser (« Formaliser un `directUrl` explicite est du ressort
de P1.10/P1.11 »).

## Contexte

Avant cette décision, `prisma/schema.prisma` ne déclarait qu'une seule
variable (`url = env("DATABASE_URL")`), utilisée à la fois :
- par `PrismaClient` au runtime (Vercel, serverless) — confirmé en
  production sur le pooler Supabase **transaction** (port 6543,
  `pgbouncer=true`, `connection_limit=1`), adapté à la charge concurrente
  serverless ;
- par le CLI Prisma (`migrate deploy`/`migrate status`, en CI) via le
  secret `PRODUCTION_DATABASE_URL`/`STAGING_DATABASE_URL`.

La séparation entre ces deux usages n'existait que par **convention
opérationnelle** (deux magasins de secrets distincts, GitHub Actions vs
Vercel, jamais synchronisés, documentée dans `DATABASE_MIGRATION_PLAN.md`
§4 et §7) — rien dans le code ne garantissait qu'une migration ne
tenterait jamais, par erreur de configuration, de s'exécuter contre le
pooler transaction, qui casse le DDL de Prisma Migrate (PgBouncer en
mode transaction ne supporte pas les opérations de schéma).

## Décision

### 1. `directUrl` dans `prisma/schema.prisma`

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

`directUrl` est une fonctionnalité stable (GA, aucun `previewFeatures`
requis) de Prisma depuis la version 3.x, pleinement compatible avec la
version installée (**5.22.0**) — aucune mise à jour de dépendance. Dès
que `directUrl` est présent, `prisma migrate dev/deploy/reset` et
`db push`/`db pull` l'utilisent **automatiquement à la place de `url`**
pour la connexion effective ; `PrismaClient` au runtime continue de lire
exclusivement `url` (`DATABASE_URL`) — **aucun changement côté Vercel**.

### 2. Nouvelle variable `DIRECT_URL`

Doit **toujours** cibler le pooler Supabase **SESSION** (port 5432),
jamais le pooler transaction. Introduite en plus de `DATABASE_URL`
(conservée pour que Prisma résolve `env("DATABASE_URL")` au chargement
du schéma, même si elle ne sert plus à la connexion de migration une fois
`directUrl` présent).

### 3. Secrets / variables d'environnement

| Environnement | Nouveau secret/variable | Rôle |
|---|---|---|
| GitHub `production` | `PRODUCTION_DIRECT_URL` | Connexion migration réelle (`prisma migrate deploy`/`status`) |
| GitHub `staging` | `STAGING_DIRECT_URL` | idem, staging |
| CI (`integration.yml`, `e2e.yml`) | `DIRECT_URL` (valeur en clair, Postgres éphémère local) | idem, base jetable sans pooler |
| Local (`.env`) | `DIRECT_URL` | Même valeur que `DATABASE_URL` local (pooler session, pas de concurrence serverless en dev) |
| Local (`.env.test`) | `DIRECT_URL` | Même valeur que `DATABASE_URL` (base de test locale, aucun pooler) |

Aucune variable Vercel modifiée. `PRODUCTION_DATABASE_URL`/
`STAGING_DATABASE_URL` existants conservés sans modification.

### 4. `scripts/guard-db-command.mjs`

Étendu pour appliquer à `DIRECT_URL` **les mêmes gardes anti-production**
que `DATABASE_URL` (liste noire par référence de projet Supabase), plus
un **refus explicite nouveau** : toute `DIRECT_URL` contenant `:6543` ou
`pgbouncer=true` est bloquée avant même l'appel à Prisma — empêche une
erreur de configuration de migration vers le pooler transaction de
remonter seulement comme un échec tardif et opaque du DDL.

### 5. Ce que cette décision ne fait PAS

- Ne modifie aucune variable Vercel existante (`DATABASE_URL` runtime
  production reste le pooler transaction, inchangé).
- Ne modifie, ne lit ni n'affiche la valeur d'aucun secret GitHub
  existant (`PRODUCTION_DATABASE_URL`/`STAGING_DATABASE_URL`).
- Ne crée pas les nouveaux secrets `PRODUCTION_DIRECT_URL`/
  `STAGING_DIRECT_URL` eux-mêmes — c'est une action opérateur sur les
  plateformes GitHub/Supabase, documentée mais non automatisée ici.
- Ne lance aucune migration contre une base réelle (staging ou
  production) — validation prévue séparément, après provisionnement des
  nouveaux secrets par l'opérateur.
- N'introduit pas `prisma.config.ts` (fonctionnalité Prisma 6.x,
  inexistante/inapplicable pour la version 5.22.0 installée).

## Conséquences

- La séparation runtime/migration, jusqu'ici une convention documentée
  mais non garantie techniquement, est désormais portée par Prisma
  lui-même (`directUrl`).
- `integration.yml`/`e2e.yml` continuent de fonctionner à l'identique
  (base éphémère locale, `DIRECT_URL` = même valeur que `DATABASE_URL`,
  aucun pooler en jeu).
- Avant la première exécution réelle de `migrate deploy` en staging/
  production après ce changement, les secrets `STAGING_DIRECT_URL`/
  `PRODUCTION_DIRECT_URL` doivent être provisionnés (pooler session,
  port 5432) — sinon le job échoue explicitement (garde « Prérequis »
  dédiée, pas de skip silencieux), sans risque de migrer contre la
  mauvaise connexion.

## Vérification

`tsc` + `lint` + `vitest` (unitaires, incluant les nouveaux cas
`guard-db-command.test.ts`) + `npm run build` + intégration locale
(`kessia_p0_test`) — voir le rapport de ce commit. Validation réelle sur
staging puis production : étape opérateur séparée, non exécutée par
cette session (nécessite les nouveaux secrets et constitue un acte sur
une base réelle).
