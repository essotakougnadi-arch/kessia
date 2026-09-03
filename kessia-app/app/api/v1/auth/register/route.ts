// ============================================================
// KESSIA — POST /api/v1/auth/register
// Inscription : création du compte + envoi OTP
// ============================================================

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db/prisma';
import { registerSchema } from '@/lib/validations/auth';
import { LEGAL_VERSION } from '@/lib/legal/versions';
import { generateOtp, otpExpiresAt, normalizePhone } from '@/lib/utils/crypto';
import { ok, created, conflict, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';
import { withDemoOtp } from '@/lib/config/demo';

export async function POST(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, 'auth.register', { limit: 5, windowMs: 60 * 60_000 });
    if (limited) return limited;

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { phone, firstName, lastName, password, userType, termsVersion } = parsed.data;
    const normalizedPhone = normalizePhone(phone);
    const acceptedVersion = termsVersion || LEGAL_VERSION;

    // Vérifier si le numéro est déjà utilisé
    const existing = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existing) {
      return conflict('Ce numéro de téléphone est déjà enregistré.');
    }

    // Hasher le mot de passe
    const passwordHash = await bcrypt.hash(password, 12);

    // Créer l'utilisateur + profil + wallet en une transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          phone: normalizedPhone,
          firstName,
          lastName,
          passwordHash,
          termsAcceptedVersion: acceptedVersion,
          termsAcceptedAt: new Date(),
        },
      });

      // Créer le profil utilisateur
      await tx.userProfile.create({
        data: {
          userId: newUser.id,
          ...(userType ? { userType, userTypeSetAt: new Date() } : {}),
        },
      });

      // Créer le wallet
      await tx.wallet.create({
        data: { userId: newUser.id },
      });

      return newUser;
    });

    // Générer et stocker l'OTP
    const otp = generateOtp(6);
    const expiresAt = otpExpiresAt(10); // 10 minutes

    await prisma.otpCode.create({
      data: {
        userId: user.id,
        phone: normalizedPhone,
        code: otp,
        purpose: 'REGISTER',
        expiresAt,
      },
    });

    // Envoyer l'OTP (DEV: console | PROD: SMS provider)
    if (process.env.SMS_PROVIDER === 'DEV') {
      console.log(`[KESSIA OTP - REGISTER] ${normalizedPhone} → Code: ${otp}`);
    }
    // TODO: Intégrer un vrai provider SMS en production

    void recordAudit({
      userId: user.id,
      action: 'auth.register',
      entity: 'User',
      entityId: user.id,
      metadata: { consentTerms: true, consentData: true, termsVersion: acceptedVersion },
      request,
    });

    return created(
      withDemoOtp(
        {
          userId: user.id,
          phone: normalizedPhone,
          otpSent: true,
          expiresAt,
        },
        otp
      ),
      'Compte créé. Un code de vérification a été envoyé par SMS.'
    );
  } catch (error) {
    logApiError('/v1/auth/register', error);
    return serverError();
  }
}
