// ============================================================
// KESSIA — Journalisation structurée (cahier des charges §47)
// Ne jamais logger de données sensibles (mot de passe, OTP, secret 2FA,
// contenu de document KYC). Voir aussi lib/audit pour l'audit métier.
//
// Rédaction (P1.9, Lot A) : une erreur Prisma de connexion peut inclure
// la chaîne de connexion complète (identifiants compris) dans son
// message ; tout ce qui transite par ce logger passe par `redact()`
// avant d'atteindre la sortie — aucun changement pour l'appelant.
// ============================================================

import winston from 'winston';

const isProd = process.env.NODE_ENV === 'production';

// scheme://user:pass@host → scheme://***@host (chaînes de connexion,
// ex. les erreurs de connexion Prisma qui embarquent DATABASE_URL).
const CONNECTION_STRING_CREDENTIALS = /:\/\/[^\s/:@]+:[^\s/:@]+@/g;
// password/secret/token/api[-_]key = "valeur" ou : "valeur" — noms de
// champ sensibles usuels, JSON ou texte libre.
const SENSITIVE_ASSIGNMENT = /((?:password|secret|token|api[_-]?key)["']?\s*[:=]\s*["']?)([^\s"',}]+)/gi;

/** Retire les identifiants d'une chaîne de connexion et les valeurs de champs sensibles d'un texte. */
export function redact(input: string): string {
  return input
    .replace(CONNECTION_STRING_CREDENTIALS, '://***@')
    .replace(SENSITIVE_ASSIGNMENT, '$1***');
}

/** Applique `redact()` récursivement (chaînes, tableaux, objets) — profondeur bornée. */
function redactDeep<T>(value: T, depth = 0): T {
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

const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    info[key] = redactDeep(info[key]);
  }
  return info;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    redactFormat(),
    isProd ? winston.format.json() : winston.format.prettyPrint({ colorize: true })
  ),
  defaultMeta: { service: 'kessia-web' },
  transports: [new winston.transports.Console()],
});

/** Log d'erreur normalisé pour les routes API. */
export function logApiError(route: string, error: unknown, meta?: Record<string, unknown>) {
  logger.error('api_error', {
    route,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...meta,
  });
}
