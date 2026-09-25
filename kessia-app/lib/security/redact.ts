// ============================================================
// KESSIA — Rédaction de données sensibles (extrait de lib/logger.ts,
// P1.13-B)
//
// Fonctions pures, sans dépendance externe (aucun import Node-only) —
// c'est précisément ce qui permet leur réutilisation depuis le runtime
// edge (lib/observability/sentry-scrub.ts → sentry.edge.config.ts), où
// Winston (fs/os) ne peut pas être chargé. lib/logger.ts réutilise ces
// mêmes fonctions et les réexporte, comportement inchangé pour ses
// appelants existants.
// ============================================================

// scheme://user:pass@host → scheme://***@host (chaînes de connexion,
// ex. les erreurs de connexion Prisma qui embarquent DATABASE_URL).
const CONNECTION_STRING_CREDENTIALS = /:\/\/[^\s/:@]+:[^\s/:@]+@/g;
// password/secret/token/api[-_]key/otp/code/pin/iban/cvv/authorization/
// cookie = "valeur" ou : "valeur" — noms de champ sensibles usuels, JSON
// ou texte libre. Insensible à la casse (flag `i`).
//
// La valeur est capturée soit comme une chaîne entre guillemets (double
// ou simple, jusqu'à son guillemet fermant — gère les valeurs contenant
// des espaces, ex. un header Authorization "Bearer xxx"), soit comme un
// jeton sans espace/quote/virgule/accolade sinon.
const SENSITIVE_ASSIGNMENT =
  /((?:password|secret|token|api[_-]?key|otp|code|pin|iban|cvv|authorization|cookie)["']?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s"',}]+)/gi;

/** Retire les identifiants d'une chaîne de connexion et les valeurs de champs sensibles d'un texte. */
export function redact(input: string): string {
  return input
    .replace(CONNECTION_STRING_CREDENTIALS, '://***@')
    .replace(SENSITIVE_ASSIGNMENT, (_match, prefix: string, value: string) => {
      const quote = value[0];
      if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
        return `${prefix}${quote}***${quote}`;
      }
      return `${prefix}***`;
    });
}

/** Applique `redact()` récursivement (chaînes, tableaux, objets) — profondeur bornée. */
export function redactDeep<T>(value: T, depth = 0): T {
  if (depth > 5 || value == null) return value;
  if (typeof value === 'string') return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v, depth + 1);
    }
    return out as T;
  }
  return value;
}
