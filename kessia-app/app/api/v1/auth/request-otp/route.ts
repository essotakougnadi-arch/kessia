// ============================================================
// KESSIA — POST /api/v1/auth/request-otp
// Demander un OTP (connexion sans mot de passe, reset, etc.)
// ============================================================

import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { requestOtpSchema } from '@/lib/validations/auth';
import { generateOtp, otpExpiresAt, normalizePhone } from '@/lib/utils/crypto';
import { ok, badRequest, validationError, serverError, tooManyRequests } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { withDemoOtp } from '@/lib/config/demo';

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 3;

export async function POST(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, 'auth.request-otp', { limit: 8, windowMs: 15 * 60_000 });
    if (limited) return limited;

    const body = await request.json();
    const parsed = requestOtpSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { phone, purpose } = parsed.data;
    const normalizedPhone = normalizePhone(phone);

    // Rate limit : max 3 OTP par minute par numéro
    const recentOtps = await prisma.otpCode.count({
      where: {
        phone: normalizedPhone,
        purpose,
        createdAt: { gt: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
      },
    });

    if (recentOtps >= RATE_LIMIT_MAX) {
      return tooManyRequests('Trop de demandes OTP. Attendez une minute avant de réessayer.');
    }

    // Pour LOGIN ou RESET: vérifier que l'utilisateur existe
    if (purpose === 'LOGIN' || purpose === 'RESET') {
      const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
      if (!user) {
        return badRequest('Aucun compte associé à ce numéro de téléphone.');
      }
    }

    // Invalider les OTP précédents non utilisés pour ce numéro/purpose
    await prisma.otpCode.updateMany({
      where: { phone: normalizedPhone, purpose, isUsed: false },
      data: { isUsed: true },
    });

    // Générer et stocker le nouvel OTP
    const otp = generateOtp(6);
    const expiresAt = otpExpiresAt(10);

    const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });

    await prisma.otpCode.create({
      data: {
        userId: user?.id,
        phone: normalizedPhone,
        code: otp,
        purpose,
        expiresAt,
      },
    });

    // Envoyer l'OTP
    if (process.env.SMS_PROVIDER === 'DEV') {
      console.log(`[KESSIA OTP - ${purpose}] ${normalizedPhone} → Code: ${otp}`);
    }

    return ok(
      withDemoOtp({ phone: normalizedPhone, expiresAt, otpSent: true }, otp),
      'Code OTP envoyé par SMS.'
    );
  } catch (error) {
    logApiError('/v1/auth/request-otp', error);
    return serverError();
  }
}
