// ============================================================
// KESSIA — Journalisation structurée (cahier des charges §47)
// Ne jamais logger de données sensibles (mot de passe, OTP, secret 2FA,
// contenu de document KYC). Voir aussi lib/audit pour l'audit métier.
// ============================================================

import winston from 'winston';

const isProd = process.env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
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
