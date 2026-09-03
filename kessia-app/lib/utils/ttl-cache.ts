// ============================================================
// KESSIA — Cache mémoire à durée de vie courte (process-local)
// Pour des réponses publiques peu changeantes servies à fort
// volume (ex. /api/v1/discover) : réduit la pression sur le
// pooler DB. Chaque instance serverless a son propre cache ;
// une entrée périmée est simplement recalculée.
// ============================================================

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

/**
 * Renvoie la valeur en cache si fraîche, sinon exécute `produce()`,
 * met en cache le résultat `ttlMs` millisecondes et le renvoie.
 * Les erreurs de `produce()` ne sont pas mises en cache.
 */
export async function cached<T>(key: string, ttlMs: number, produce: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await produce();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** Invalide une clé (ou tout le cache si `key` omis). */
export function invalidate(key?: string): void {
  if (key) store.delete(key);
  else store.clear();
}
