// ============================================================
// KESSIA — request-id / corrélation (P1.13-C)
//
// Primitive de génération/validation, pure et sans dépendance externe.
// Utilise UNIQUEMENT `crypto.randomUUID()` global (Web Crypto API,
// disponible nativement en edge runtime ET en Node ≥19) — jamais
// `import crypto from 'crypto'` (lib/utils/crypto.ts en dépend et n'est
// donc PAS utilisable ici : même classe de piège edge-incompatible que
// Winston/fs/os déjà rencontrée et corrigée en P1.13-B).
//
// Utilisé à la fois par middleware.ts (edge — résout/valide le
// request-id de chaque requête) et par lib/observability/
// request-context.ts (Node — revalide en défense en profondeur avant
// de l'attacher à Winston/Sentry).
// ============================================================

export const REQUEST_ID_HEADER = 'x-request-id';

const UUID_V4_LENGTH = 36;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Valide strictement un UUID v4. Trois vérifications explicites et
 * séparées (longueur exacte, absence de caractère de contrôle, format)
 * plutôt qu'une seule regex opaque — auditable, et chacune est
 * individuellement couverte par un test. Ne "nettoie" jamais une
 * valeur : elle est valide telle quelle, ou rejetée intégralement.
 */
export function isValidRequestId(value: string): boolean {
  if (value.length !== UUID_V4_LENGTH) return false;
  if (CONTROL_CHAR_PATTERN.test(value)) return false;
  return UUID_V4_PATTERN.test(value);
}

/**
 * Conserve un x-request-id entrant s'il est un UUID v4 strictement
 * valide, sinon en génère un nouveau. Jamais de valeur "nettoyée" —
 * c'est l'une ou l'autre, jamais un hybride.
 */
export function resolveRequestId(incoming: string | null | undefined): string {
  if (incoming != null && isValidRequestId(incoming)) return incoming;
  return crypto.randomUUID();
}
