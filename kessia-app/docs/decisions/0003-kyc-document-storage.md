# ADR 0003 — Stockage des pièces KYC en MVP

**Statut :** superseded par [ADR 0014](0014-infra-storage-ratelimit-ordonnanceur.md) · **Date :** 2026-08-28

> **Mise à jour (ADR 0014)** : le stockage Supabase Storage (bucket privé +
> URL signées) est désormais implémenté et utilisé dès que
> `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` sont configurés.
> Le comportement data-URI ci-dessous reste le **repli** (dev / non
> configuré / échec d'upload).

## Contexte
Le cahier des charges (§25, §30) prévoit un coffre documentaire chiffré (Supabase Storage, buckets `kyc-documents`). Cette intégration n'est pas encore branchée. Le KYC doit néanmoins être **fonctionnel** pour la phase pilote (parcours critique §49).

## Décision
- `POST /api/v1/kyc/documents` accepte `{ type, dataUrl }` où `dataUrl` est une **image compressée côté client** (canvas → JPEG ≤ ~2,5 Mo, max 1400 px).
- L'image est stockée telle quelle dans `KycDocument.fileUrl` (colonne `text` PostgreSQL).
- `GET /api/v1/kyc` **ne renvoie jamais** `fileUrl` (payload).
- Le dossier passe automatiquement en `UNDER_REVIEW` dès qu'une pièce d'identité + un selfie sont présents.

## Conséquences
- ✅ Le parcours KYC est réel de bout en bout (capture → revue → statut).
- ⚠️ **Dette** : bloat de la base, pas de chiffrement au repos géré par nous, pas d'URL signée.
- ⏭️ Production : Supabase Storage + URL signées + `fileUrl` = clé d'objet. Migration des `data:` existants à prévoir.
