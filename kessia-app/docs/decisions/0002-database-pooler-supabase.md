# ADR 0002 — Connexion PostgreSQL via le pooler Supabase

**Statut :** accepté · **Date :** 2026-08-28

## Contexte
L'hôte de connexion directe `db.<ref>.supabase.co:5432` ne répond plus (Supabase a déprécié l'IPv4 pour les connexions directes). `prisma db push` et l'app échouaient avec `P1001 Can't reach database server`.

## Décision
- `DATABASE_URL` (app + CLI Prisma) → **pooler en mode session** : `postgres.<ref>:<pwd>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`.
  Le mode session (port 5432) supporte les transactions interactives Prisma.
- `DATABASE_URL_POOLER` → **pooler en mode transaction** : `...:6543/postgres?pgbouncer=true`, réservé au déploiement serverless/production.
- Fichier `.env` créé (le CLI Prisma ne lit pas `.env.local`), à garder synchronisé avec `.env.local`.

## Conséquences
- ✅ `db push`, `db seed` et l'app fonctionnent.
- ⚠️ En production serverless, basculer l'app sur le pooler transaction (6543) et ajouter `directUrl` au datasource Prisma pour les migrations.
- ⚠️ Secrets DB versionnés en clair dans `.env` / `.env.local` — `.gitignore` les exclut ; prévoir un gestionnaire de secrets (§31).
