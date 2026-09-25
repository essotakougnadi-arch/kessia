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
import { redact, redactDeep } from './security/redact';

const isProd = process.env.NODE_ENV === 'production';

// `redact`/`redactDeep` vivent dans lib/security/redact.ts (aucune
// dépendance Node-only) et sont réexportées ici à l'identique — permet
// leur réutilisation depuis le runtime edge (lib/observability/
// sentry-scrub.ts) sans y entraîner Winston (fs/os), inutilisable côté
// edge. Comportement inchangé pour les appelants existants de ce module.
export { redact, redactDeep };

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
