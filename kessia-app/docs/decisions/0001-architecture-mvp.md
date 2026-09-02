# ADR 0001 — Architecture du MVP : modular monolith Next.js

**Statut :** accepté · **Date :** 2026-08

## Contexte
Le cahier des charges cible à terme : mobile Flutter, portail web React/Next, backend NestJS, monorepo `apps/{mobile,web,admin}` + `backend/` (§39-41). Le MVP doit prouver 5 hypothèses produit rapidement (MVP §1).

## Décision
Pour le MVP, une seule application **Next.js 14 (App Router)** qui contient :
- le frontend web + PWA,
- les routes API (`app/api/v1/*`),
- l'accès base de données (Prisma).

C'est le « modular monolith propre » explicitement autorisé par le cahier des charges (§40) : « privilégier un modular monolith propre plutôt que des microservices prématurés ».

## Conséquences
- ✅ Vélocité maximale, un seul déploiement, types partagés implicites.
- ✅ Séparation logique respectée : `lib/` (domaine + infra), `app/api/` (application), `app/(...)` (présentation).
- ⚠️ Le backend NestJS et le monorepo `apps/` seront introduits quand le mobile Flutter et/ou l'admin séparé le justifieront (Phase 8).
- ⚠️ La couche `PaymentProvider` (§6.3) et l'abstraction LLM (§39) doivent rester des interfaces dans `lib/` pour permettre l'extraction ultérieure.
