// ============================================================
// KESSIA — POST /api/v1/auth/verify-otp
// Vérification OTP → création session JWT
// ============================================================

import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { verifyOtpSchema } from '@/lib/validations/auth';
import { normalizePhone } from '@/lib/utils/crypto';
import { buildSessionResponse } from '@/lib/auth/session';
import { issue2faChallenge } from '@/lib/auth/twofactor';
import { ok, badRequest, validationError, serverError, notFound } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';

export async function POST(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, 'auth.verify-otp', { limit: 15, windowMs: 15 * 60_000 });
    if (limited) return limited;

    const body = await request.json();
    const parsed = verifyOtpSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { phone, code, purpose } = parsed.data;
    const normalizedPhone = normalizePhone(phone);

    // Trouver l'OTP le plus récent non utilisé pour ce numéro/purpose
    const otpRecord = await prisma.otpCode.findFirst({
      where: {
        phone: normalizedPhone,
        purpose,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      return badRequest('Code OTP introuvable ou expiré. Demandez un nouveau code.');
    }

    // Vérifier le nombre de tentatives (max 5)
    if (otpRecord.attempts >= 5) {
      return badRequest('Trop de tentatives incorrectes. Demandez un nouveau code OTP.');
    }

    // Vérifier le code
    if (otpRecord.code !== code) {
      await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      return badRequest('Code OTP incorrect.');
    }

    // Marquer l'OTP comme utilisé
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // Trouver l'utilisateur
    const user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user) {
      return notFound('Utilisateur introuvable.');
    }

    // Marquer le téléphone comme vérifié (si REGISTER ou VERIFY)
    if (purpose === 'REGISTER' || purpose === 'VERIFY') {
      await prisma.user.update({
        where: { id: user.id },
        data: { isPhoneVerified: true },
      });
    }

    // MFA activée (connexion par OTP) → défi TOTP
    if (purpose === 'LOGIN' && user.twoFactorEnabled) {
      return ok(
        { requires2fa: true, challengeToken: issue2faChallenge(user.id) },
        'Saisissez le code de votre application d\'authentification.'
      );
    }

    // Créer la session JWT
    const ipAddress = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined;
    const deviceInfo = request.headers.get('user-agent') ?? undefined;

    const payload = await buildSessionResponse(user, {
      ipAddress: ipAddress ?? undefined,
      deviceInfo,
    });

    void recordAudit({
      userId: user.id,
      action: purpose === 'REGISTER' ? 'auth.register_verified' : 'auth.login',
      entity: 'User',
      entityId: user.id,
      metadata: { method: 'otp', purpose },
      request,
    });

    return ok(payload, 'Vérification réussie. Vous êtes connecté.');
  } catch (error) {
    logApiError('/v1/auth/verify-otp', error);
    return serverError();
  }
}
