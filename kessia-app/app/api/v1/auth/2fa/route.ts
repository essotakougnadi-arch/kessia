// ============================================================
// KESSIA — MFA / TOTP : setup, activation, désactivation
//   POST   { step: 'setup' }             → { secret, otpauthUri }
//   POST   { step: 'enable', code }       → { backupCodes: [...] }
//   DELETE { code }                       → désactive
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import {
  generateTotpSecret, totpAuthUri, verifyTotp, generateBackupCodes,
} from '@/lib/auth/twofactor';
import { recordAudit } from '@/lib/audit/audit.service';
import { ok, badRequest, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const bodySchema = z.discriminatedUnion('step', [
  z.object({ step: z.literal('setup') }),
  z.object({ step: z.literal('enable'), code: z.string().min(6).max(10) }),
]);

export async function GET(request: NextRequest) {
  const { error, context } = await withAuth(request);
  if (error || !context) return error!;
  const user = await prisma.user.findUnique({
    where: { id: context.userId },
    select: { twoFactorEnabled: true, twoFactorBackup: true },
  });
  return ok({ enabled: !!user?.twoFactorEnabled, backupCodesRemaining: user?.twoFactorBackup.length ?? 0 });
}

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const user = await prisma.user.findUnique({ where: { id: context.userId } });
    if (!user) return badRequest('Utilisateur introuvable.');

    if (parsed.data.step === 'setup') {
      if (user.twoFactorEnabled) return badRequest('La double authentification est déjà active.');
      const secret = generateTotpSecret();
      // stocké mais pas encore "enabled"
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });
      return ok({ secret, otpauthUri: totpAuthUri(secret, user.phone) }, 'Scannez le QR code puis confirmez avec un code.');
    }

    // step === 'enable'
    if (!user.twoFactorSecret) return badRequest('Lancez d\'abord la configuration.');
    if (!verifyTotp(user.twoFactorSecret, parsed.data.code)) {
      return badRequest('Code incorrect. Vérifiez l\'heure de votre téléphone.');
    }
    const { plain, hashed } = generateBackupCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorBackup: hashed },
    });
    void recordAudit({ userId: user.id, action: 'auth.2fa_enabled', entity: 'User', entityId: user.id, request });
    return ok({ backupCodes: plain }, 'Double authentification activée. Notez vos codes de secours.');
  } catch (e) {
    logApiError('/v1/auth/2fa', e);
    return serverError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const { code } = z.object({ code: z.string().min(6).max(20) }).parse(await request.json());
    const user = await prisma.user.findUnique({ where: { id: context.userId } });
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) return badRequest('La MFA n\'est pas active.');
    if (!verifyTotp(user.twoFactorSecret, code)) return badRequest('Code incorrect.');

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackup: [] },
    });
    void recordAudit({ userId: user.id, action: 'auth.2fa_disabled', entity: 'User', entityId: user.id, request });
    return ok(null, 'Double authentification désactivée.');
  } catch (e) {
    logApiError('/v1/auth/2fa', e);
    return serverError();
  }
}
