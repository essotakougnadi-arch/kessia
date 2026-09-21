// ============================================================
// KESSIA — Verrou consultatif PostgreSQL (P1.7)
//
// Empêche deux exécutions concurrentes d'une même tâche (ex. le tick
// cron, potentiellement déclenché par deux ordonnanceurs indépendants —
// GitHub Actions `cron.yml` + Vercel Cron `vercel.json` — sans
// coordination entre eux).
//
// Variante `pg_try_advisory_xact_lock` (transaction-scoped), pas
// `pg_advisory_lock`/`pg_advisory_unlock` (session-scoped) : en
// environnement poolé (PgBouncer / pooler Supabase, Prisma serverless),
// rien ne garantit que l'acquisition et la libération d'un verrou
// session-scoped s'exécutent sur la MÊME connexion physique — le verrou
// pourrait ne jamais être relâché. La variante `xact` est acquise et
// relâchée automatiquement avec la transaction qui la porte (commit,
// rollback, ou perte de connexion) : aucun verrou "collé" possible, pas
// de libération manuelle à oublier.
// ============================================================

import prisma from './prisma';

/** Hash 32 bits stable d'une chaîne — clé bigint pour pg_try_advisory_xact_lock. */
function lockKey(name: string): bigint {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return BigInt(hash);
}

export type AdvisoryLockResult<T> = { skipped: true } | { skipped: false; result: T };

/**
 * Exécute `fn` sous verrou consultatif nommé (non bloquant). Si une autre
 * exécution détient déjà le verrou, `fn` n'est PAS appelée et le résultat
 * est `{ skipped: true }` — pas une erreur, un no-op tracé par l'appelant.
 */
export async function withAdvisoryLock<T>(
  name: string,
  fn: () => Promise<T>
): Promise<AdvisoryLockResult<T>> {
  const key = lockKey(name);
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${key}) AS locked
      `;
      if (!locked) return { skipped: true as const };
      const result = await fn();
      return { skipped: false as const, result };
    },
    { timeout: 55_000, maxWait: 10_000 }
  );
}
