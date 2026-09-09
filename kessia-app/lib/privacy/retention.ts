// ============================================================
// KESSIA — Purge programmée selon la matrice de conservation
// (docs/compliance/matrix.md §9, RGPD art. 5-1-e).
//
// Purge automatique (branchée sur le tick horaire) des données
// techniques à courte durée de vie. Ce qui doit être conservé
// (ledger 10 ans, audit_logs 5 ans, KYC 5-10 ans) n'est jamais
// touché ici — voir `lib/privacy/erasure.ts` pour l'effacement
// d'un compte, encadré et manuel.
// ============================================================

import prisma from '@/lib/db/prisma';

const DAY = 86_400_000;

/** Fenêtres de conservation (jours). Alignées sur la matrice §9. */
export const RETENTION_DAYS = {
  /** OTP : usage unique + expiration 10 min ; on purge la trace après 7 j. */
  otp: 7,
  /** Sessions : expiration 30 j ; on purge les expirées après 1 j de grâce. */
  session: 1,
  /** Notifications lues : 12 mois. Les non lues sont conservées. */
  notificationRead: 365,
  /** Journal d'audit : 5 ans. */
  auditLog: 5 * 365,
} as const;

export type RetentionResult = {
  otps: number;
  sessions: number;
  notifications: number;
  auditLogs: number;
};

export async function runRetentionPurge(now = Date.now()): Promise<RetentionResult> {
  const [otps, sessions, notifications, auditLogs] = await Promise.all([
    prisma.otpCode
      .deleteMany({ where: { expiresAt: { lt: new Date(now - RETENTION_DAYS.otp * DAY) } } })
      .then((r) => r.count)
      .catch(() => 0),
    prisma.session
      .deleteMany({ where: { expiresAt: { lt: new Date(now - RETENTION_DAYS.session * DAY) } } })
      .then((r) => r.count)
      .catch(() => 0),
    prisma.notification
      .deleteMany({
        where: {
          isRead: true,
          createdAt: { lt: new Date(now - RETENTION_DAYS.notificationRead * DAY) },
        },
      })
      .then((r) => r.count)
      .catch(() => 0),
    prisma.auditLog
      .deleteMany({ where: { createdAt: { lt: new Date(now - RETENTION_DAYS.auditLog * DAY) } } })
      .then((r) => r.count)
      .catch(() => 0),
  ]);

  return { otps, sessions, notifications, auditLogs };
}
