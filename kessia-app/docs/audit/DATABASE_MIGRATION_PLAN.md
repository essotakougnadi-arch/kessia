---
title: "KESSIA — Plan de migration de base de données (Prisma Migrate)"
date: "11 septembre 2026"
---

# KESSIA — Plan de migration de base de données

**Statut : P0.0 réalisé.** Ce document accompagne l'ADR
[0048-migrations-prisma-versionnees](../decisions/0048-migrations-prisma-versionnees.md)
et sert de référence opérationnelle pour toute évolution de schéma à partir
de maintenant.

## 1. Ce qui a changé

| Avant | Après |
|---|---|
| Pas de `prisma/migrations/` | `prisma/migrations/0_init/migration.sql` (baseline, 44 tables / 45 enums, généré depuis le schéma actuel — aucune instruction destructive) |
| CI (`integration.yml`, `e2e.yml`) : `prisma db push --skip-generate` | `prisma migrate deploy` |
| Base de test isolée (`db:test:reset`) : `prisma db push --force-reset` | `prisma migrate reset --force` |
| Aucun script `migrate deploy` | `npm run db:migrate:deploy` |
| Doc/README : « synchronise le schéma avec `db push` » | Doc/README : `migrate deploy` sur les bases partagées, `db push` réservé au prototypage jetable |

`db:migrate` (`prisma migrate dev`) existait déjà mais n'était utilisé par
rien — c'est désormais la commande de **création** de migration en
développement.

## 2. Comment créer une migration à partir de maintenant

```bash
# 1. Modifier prisma/schema.prisma
# 2. Générer + appliquer la migration sur VOTRE base de dev (.env.local, ou mieux
#    une base de dev personnelle si vous en avez une — jamais directement la démo
#    partagée en écriture concurrente avec d'autres développeurs)
npx prisma migrate dev --name <intitulé_court_en_snake_case>

# 3. Relire le SQL généré dans prisma/migrations/<timestamp>_<intitulé>/migration.sql
#    — c'est la revue de code du changement de schéma.
# 4. Committer prisma/migrations/ AVEC le commit de code qui l'accompagne.
```

`migrate dev` compare l'état de la base cible à l'historique de migrations,
génère le SQL du delta, l'applique, régénère le client Prisma. Si la base
cible a dérivé de l'historique (schema drift), Prisma le signale et propose
de réinitialiser — ne jamais accepter un reset sur une base contenant des
données réelles sans sauvegarde préalable (§5).

## 3. Comment appliquer les migrations sur une base partagée

```bash
npx prisma migrate deploy
```

(alias `npm run db:migrate:deploy`) — applique uniquement les migrations non
encore enregistrées dans la table `_prisma_migrations` de la base cible, dans
l'ordre, sans jamais tenter de générer un delta arbitraire. C'est la seule
commande à utiliser sur la base de démo, une future base staging, ou une
future base de production.

**Interdiction formelle** (portée par cette phase de remédiation) :
`prisma db push` sur toute base partagée (démo, staging, prod). Réservé au
prototypage sur une base locale jetable.

## 4. Baseliner la base de démo existante — procédure opérateur

La base de démo partagée (`aws-1-eu-west-1.pooler.supabase.com`, projet
`uwvnarmojdbutbunzqww`) contient déjà, physiquement, exactement le schéma que
`prisma/migrations/0_init/` décrit (c'est elle qui a servi de référence pour
le générer). Il ne faut **jamais exécuter** cette migration dessus (elle
tenterait de recréer des tables qui existent déjà et échouerait, ou pire, sur
une base légèrement divergente). Il faut la **marquer comme déjà appliquée**.

Cette étape n'a pas été exécutée par cette session (nécessite les identifiants
de production et est un acte sur une base réelle) — à exécuter par l'opérateur
disposant de `DATABASE_URL` :

```bash
# 0. Sauvegarde préalable (obligatoire, même si l'opération suivante est
#    non destructive en théorie — règle absolue de la Phase 0).
npm run db:backup

# 1. Vérifier qu'il n'y a AUCUN écart entre la base réelle et le schéma
#    (si cette commande produit du SQL non vide, NE PAS continuer — le
#    schéma déclaré diverge de la base réelle, il faut d'abord comprendre
#    pourquoi avant de baseliner).
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script
# Attendu : sortie vide (ou uniquement des commentaires), aucune instruction SQL.

# 2. Marquer la baseline comme déjà appliquée SANS l'exécuter.
npx prisma migrate resolve --applied 0_init

# 3. Vérifier l'état.
npx prisma migrate status
# Attendu : "Database schema is up to date!"
```

**Preuve de conservation des données** : l'étape 1 est en lecture seule
(introspection). L'étape 2 ne fait qu'insérer une ligne dans
`_prisma_migrations` (table de suivi Prisma) — **aucune table applicative
n'est touchée**. Après l'étape 3, relancer un `SELECT count(*)` sur 3-4
tables clés (`users`, `wallets`, `ledger_entries`) et comparer aux comptages
d'avant l'opération (capturés à l'étape 0 via `db:backup` ou une requête
manuelle) pour attester qu'aucune ligne n'a disparu.

À répéter, avec le même `DATABASE_URL`, sur chaque environnement qui pointe
aujourd'hui vers cette base de démo (il n'y en a qu'un à ce jour — pas encore
de staging séparé, cf. P1.9).

## 5. Migrations destructives (colonne supprimée, table renommée, etc.)

Aucune n'est prévue en Phase 0, mais la règle pour toute la suite :

1. **Identifier les données concernées** — quelles lignes, combien, sur
   quelle table, la colonne est-elle lue ailleurs dans le code (grep) ?
2. **Produire un plan écrit** dans la PR : ce qui est supprimé, pourquoi,
   ce qui pourrait le lire.
3. **Sauvegarde** (`npm run db:backup`) juste avant application, horodatée,
   conservée jusqu'à confirmation que tout va bien.
4. **Vérifier sur staging d'abord** (dès que P1.9 livre un staging réel) —
   jamais une migration destructive directement en prod sans passage
   préalable par un environnement équivalent.
5. **Preuve de conservation** : si la migration ne fait que renommer/déplacer
   des données (ex. split de colonne), le SQL doit `UPDATE`/copier avant de
   `DROP` — jamais un `DROP COLUMN` sec sur une colonne qui contient encore
   des données utiles. Documenter la requête de vérification post-migration.
6. **Fenêtre de maintenance** si le volume ou le verrouillage de table le
   justifie (`ALTER TABLE` sur une grande table peut verrouiller en écriture).

## 6. Rollback

Prisma Migrate n'a pas de "down migration" automatique. Deux niveaux :

- **Avant que la migration ne soit largement déployée** (ex. juste appliquée
  en staging, bug détecté) : écrire à la main une migration inverse
  (`prisma migrate dev --name rollback_<x>` avec le schéma remis à l'état
  précédent) et l'appliquer normalement. C'est une migration de plus dans
  l'historique, jamais une réécriture de l'historique existant.
- **Après un déploiement en production avec des données déjà écrites dans
  le nouveau schéma** : pas de rollback de schéma sans risque de perte —
  la voie sûre est la **restauration depuis la sauvegarde** prise à l'étape 5.3
  ci-dessus, sur un environnement de bascule, avec le RTO/RPO mesurés en
  P1.16 (`DISASTER_RECOVERY_TEST_REPORT.md`).

**Règle** : ne jamais éditer un fichier `migration.sql` déjà appliqué sur une
base (le checksum enregistré dans `_prisma_migrations` ne correspondrait
plus — `migrate deploy` le détecterait et refuserait). Une correction se fait
toujours par une **nouvelle** migration.

## 7. Ce qui reste hors P0.0 (autres items du plan de remédiation)

- **P1.7 (CI)** : job de détection de dérive schéma↔migrations sur chaque PR
  (`prisma migrate diff --from-migrations … --to-schema-datamodel … --exit-code`
  contre un Postgres de CI), garde explicite interdisant `db push` dans les
  scripts de déploiement.
- **P1.9 (staging)** : un vrai environnement staging avec sa propre base,
  sur laquelle `migrate deploy` s'exécute dans le pipeline avant la
  production.
- **P1.10/P1.11 (secrets, pooling)** : si le runtime applicatif bascule sur
  le pooler transaction (port 6543, `pgbouncer=true`), un `directUrl` séparé
  (port 5432) devra être ajouté au bloc `datasource db` pour que
  `migrate deploy`/`migrate dev` continuent de fonctionner (le mode
  transaction ne supporte pas le DDL avancé de Prisma Migrate).

## 8. Fichiers concernés par ce changement

- `prisma/migrations/migration_lock.toml` (nouveau)
- `prisma/migrations/0_init/migration.sql` (nouveau, baseline)
- `.github/workflows/integration.yml`, `.github/workflows/e2e.yml`
  (`db push` → `migrate deploy`)
- `scripts/db-test-reset.mjs` (`db push --force-reset` → `migrate reset --force`)
- `package.json` (nouveau script `db:migrate:deploy`)
- `README.md`, `docs/development/testing.md` (documentation)
- `docs/decisions/0048-migrations-prisma-versionnees.md` (ADR)
