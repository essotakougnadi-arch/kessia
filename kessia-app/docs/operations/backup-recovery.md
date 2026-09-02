# Sauvegarde & reprise après incident (§48, §31)

_Runbook opérationnel. À revoir à chaque changement d'hébergeur._

## 1. Sauvegardes automatiques (hébergeur)

La base est hébergée sur **Supabase (PostgreSQL managé)**.

| Mécanisme | Portée | Rétention | Action requise |
|---|---|---|---|
| **Snapshots quotidiens** | base complète | 7 jours (plan de base) → à porter à 30 j sur plan Pro | Activer le plan Pro avant le pilote |
| **PITR (Point-In-Time Recovery)** | journal WAL continu | selon plan | À activer (plan Pro) — permet de restaurer à la seconde près |
| **Sauvegarde manuelle** | `scripts/db-backup.mjs` | selon stockage choisi | Lancée avant chaque migration risquée |

> Bloquant pilote : passer au plan qui garantit PITR + 30 j de rétention, et
> stocker une copie hebdomadaire hors-hébergeur (bucket chiffré séparé).

## 2. Sauvegarde manuelle

```bash
cd kessia-app
# charge DATABASE_URL depuis .env puis lance pg_dump (format custom, compressé)
node -r dotenv/config scripts/db-backup.mjs
# → kessia-app/backups/kessia-<timestamp>.dump
```

À faire **systématiquement avant** : `prisma db push` en production, `prisma migrate deploy`, un import de données, une opération de masse.

## 3. Restauration

### 3.1 Depuis un snapshot Supabase
1. Console Supabase → *Database* → *Backups* → choisir le snapshot → *Restore*.
2. La restauration crée une nouvelle instance ; basculer `DATABASE_URL` (et `DIRECT_URL`) vers la nouvelle.
3. Relancer `prisma generate` puis un `smoke` (voir §5).

### 3.2 Depuis un dump manuel
```bash
# base cible VIDE (jamais sur la prod en place sans validation)
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname "$TARGET_DATABASE_URL" kessia-app/backups/kessia-<timestamp>.dump
```

### 3.3 PITR
Console Supabase → *Point in Time* → saisir l'horodatage cible (juste avant l'incident) → *Restore*.

## 4. Objectifs (à valider avec la direction)

| Indicateur | Cible pilote |
|---|---|
| **RPO** (perte de données max) | ≤ 5 min (PITR) |
| **RTO** (temps de remise en service) | ≤ 2 h |

## 5. Test de restauration (à exécuter et consigner **trimestriellement**)

1. Créer une base jetable (`kessia_dr_test`).
2. Restaurer le dernier dump manuel + le dernier snapshot.
3. Pointer une instance de test sur cette base, lancer :
   ```bash
   SMOKE_BASE_URL=https://dr-test.kessia.app SMOKE_PHONE=... SMOKE_PASSWORD=... \
     node scripts/smoke.mjs
   ```
4. Vérifier : login, solde wallet, liste des tontines, une écriture ledger de test, cohérence des soldes (`SELECT SUM(...)`).
5. Consigner la date, la durée réelle (RTO constaté) et les écarts dans `docs/operations/dr-log.md`.

## 6. Réponse à incident (résumé)

1. **Constat** : alerte monitoring (`/api/metrics`, `/api/health` 503) ou signalement.
2. **Confinement** : si compromission suspectée → révoquer les sessions (`session.deleteMany` ciblé), forcer rotation `JWT_SECRET` / `JWT_REFRESH_SECRET`, bloquer les retraits (`wallet.isLocked`).
3. **Éradication / restauration** : selon la nature (voir §3).
4. **Post-mortem** : cause racine, correctif, mise à jour de ce runbook.
5. **Obligations réglementaires** : selon la matrice `docs/compliance/matrix.md` (déclaration éventuelle sous 72 h).

## 7. Secrets

Aujourd'hui les secrets sont dans `.env` / variables d'environnement de l'hébergeur (`.env.example` liste tous les paramètres).
**Bloquant pilote** : migrer vers un gestionnaire de secrets (Vault, Doppler, ou secrets chiffrés de l'hébergeur avec accès audité) et documenter la rotation de : `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NEXTAUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_WEBHOOK_SECRET`, `CRON_SECRET`, `METRICS_TOKEN`, `UPSTASH_REDIS_REST_TOKEN`, `NOTIFY_WEBHOOK_SECRET`, clés fournisseurs.

## 8. Nettoyage du stockage KYC (RGPD)

Lors d'une suppression / anonymisation de compte (procédure manuelle
encadrée), supprimer aussi les objets du bucket `SUPABASE_KYC_BUCKET` sous le
préfixe `{userId}/` — via la console Supabase ou l'API Storage
(`DELETE /storage/v1/object/{bucket}` avec `{ "prefixes": ["{userId}/…"] }`).
