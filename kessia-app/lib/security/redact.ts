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

// P1.13-D — mêmes mots-clés que SENSITIVE_ASSIGNMENT ci-dessus (texte
// libre), sous forme de liste pour la correspondance par NOM DE CLÉ d'un
// objet structuré. Volontairement séparée de SENSITIVE_ASSIGNMENT (pas
// dérivée dynamiquement de la regex) pour ne rien changer au
// comportement existant du filtrage en texte libre — à maintenir
// synchronisée manuellement si la liste de mots-clés évolue.
//
// Comparaison par sous-chaîne sur la clé normalisée (minuscule,
// underscores/tirets retirés) — délibérément large, cohérent avec le
// filtrage en texte libre existant (ex. "code" matche aussi
// "otpCode"/"postalCode" : un faux positif sur un champ non sensible
// masque juste sa valeur dans les logs, jamais l'inverse).
const SENSITIVE_KEY_SUBSTRINGS = [
  'password',
  'secret',
  'token',
  'apikey',
  'otp',
  'code',
  'pin',
  'iban',
  'cvv',
  'authorization',
  'cookie',
];

const SENSITIVE_KEY_VALUE_REPLACEMENT = '***';

/** Vrai si le nom de clé correspond à un champ sensible usuel. */
function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, '');
  return SENSITIVE_KEY_SUBSTRINGS.some((keyword) => normalized.includes(keyword));
}

/**
 * Applique `redact()` récursivement (chaînes, tableaux, objets) —
 * profondeur bornée.
 *
 * P1.13-D : lors du parcours d'un objet, le NOM de chaque clé est
 * inspecté avant sa valeur — si la clé correspond à un champ sensible
 * (password/secret/token/apiKey/otp/code/pin/iban/cvv/authorization/
 * cookie et variantes), la valeur entière est remplacée par `***`, quel
 * que soit son contenu ou son type, SANS y descendre (`redact()` seul
 * ne pouvait pas protéger un objet structuré comme
 * `{ password: 'hunter2' }` — la chaîne "hunter2" ne contient aucun
 * motif reconnaissable une fois séparée de sa clé). S'applique à
 * chaque niveau de la récursion, jusqu'à la même profondeur bornée
 * qu'avant.
 */
export function redactDeep<T>(value: T, depth = 0): T {
  if (depth > 5 || value == null) return value;
  if (typeof value === 'string') return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? SENSITIVE_KEY_VALUE_REPLACEMENT : redactDeep(v, depth + 1);
    }
    return out as T;
  }
  return value;
}
