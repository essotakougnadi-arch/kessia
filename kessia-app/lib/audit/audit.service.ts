// ============================================================
// KESSIA — Journal d'audit (cahier des charges §31, §47, §51)
// « Toute action critique doit être auditable » (MASTER #15).
//
// Ne JAMAIS logger de données sensibles brutes (mot de passe, code
// OTP, contenu de document KYC). Les montants et identifiants sont OK.
// ============================================================

import prisma from '@/lib/db/prisma';

type Headersish = { get(name: string): string | null };

export function requestMeta(req?: { headers: Headersish }): {
  ipAddress?: string;
  userAgent?: string;
} {
  const h = req?.headers;
  return {
    ipAddress:
      h?.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      h?.get('x-real-ip') ||
      undefined,
    userAgent: h?.get('user-agent') || undefined,
  };
}

export type AuditInput = {
  userId?: string | null;
  /** ex. 'auth.login', 'wallet.transfer', 'kyc.submit_document' */
  action: string;
  /** ex. 'User', 'Wallet', 'Tontine', 'KycCase' */
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  request?: { headers: Headersish };
};

/**
 * Écrit une entrée d'audit. Ne lève jamais : un échec d'audit ne doit
 * pas casser l'action métier (mais il est loggé).
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const { ipAddress, userAgent } = requestMeta(input.request);
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? undefined,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? undefined,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
        ipAddress,
        userAgent,
        metadata: (input.metadata ?? undefined) as never,
      },
    });
  } catch (e) {
    console.error('[AUDIT] échec écriture', input.action, e);
  }
}
