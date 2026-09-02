// ============================================================
// KESSIA — POST /api/v1/auth/2fa/verify
// Étape finale de connexion quand la MFA est activée.
// Body : { challengeToken, code }  (code TOTP ou code de secours)
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { buildSessionResponse } from '@/lib/auth/session';
import { verify2faChallenge, verifyTotp, consumeBackupCode } from '@/lib/auth/twofactor';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';
import { ok, badRequest, unauthorized, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

const schema = z.object({
  challengeToken: z.string().min(10),
  code: z.string().min(4).max(20),
});

export async function POST(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, 'auth.2fa', { limit: 10, windowMs: 15 * 60_000 });
    if (limited) return limited;

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const challenge = verify2faChallenge(parsed.data.challengeToken);
    if (!challenge) return unauthorized('Session de connexion expirée. Recommencez.');

    const user = await prisma.user.findUnique({ where: { id: challenge.sub } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return badRequest('La double authentification n\'est pas active pour ce compte.');
    }

    const code = parsed.data.code.trim();
    let ok2fa = verifyTotp(user.twoFactorSecret, code);

    // Sinon, tenter un code de secours
    if (!ok2fa) {
      const remaining = consumeBackupCode(user.twoFactorBackup, code);
      if (remaining) {
        ok2fa = true;
        await prisma.user.update({ where: { id: user.id }, data: { twoFactorBackup: remaining } });
        void recordAudit({ userId: user.id, action: 'auth.2fa_backup_used', entity: 'User', entityId: user.id, request });
      }
    }

    if (!ok2fa) {
      void recordAudit({ userId: user.id, action: 'auth.2fa_failed', entity: 'User', entityId: user.id, request });
      return badRequest('Code incorrect.');
    }

    const ipAddress = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined;
    const payload = await buildSessionResponse(user, {
      ipAddress: ipAddress ?? undefined,
      deviceInfo: request.headers.get('user-agent') ?? undefined,
    });

    void recordAudit({ userId: user.id, action: 'auth.login', entity: 'User', entityId: user.id, metadata: { method: '2fa' }, request });
    return ok(payload, 'Connexion réussie.');
  } catch (e) {
    logApiError('/v1/auth/2fa/verify', e);
    return serverError();
  }
}
