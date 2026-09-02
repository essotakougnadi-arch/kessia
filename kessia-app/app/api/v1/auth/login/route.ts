// ============================================================
// KESSIA — POST /api/v1/auth/login
// Connexion par mot de passe → session JWT
// ============================================================

import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db/prisma';
import { loginSchema } from '@/lib/validations/auth';
import { normalizePhone } from '@/lib/utils/crypto';
import { buildSessionResponse } from '@/lib/auth/session';
import { issue2faChallenge } from '@/lib/auth/twofactor';
import { ok, badRequest, validationError, serverError, forbidden } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';
import { assessEvent } from '@/lib/fraud/engine';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, 'auth.login', { limit: 10, windowMs: 15 * 60_000 });
    if (limited) return limited;

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { phone, password } = parsed.data;
    const normalizedPhone = normalizePhone(phone);

    // Trouver l'utilisateur
    const user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user || !user.passwordHash) {
      return badRequest('Numéro de téléphone ou mot de passe incorrect.');
    }

    // Vérifier si le compte est verrouillé
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return forbidden(
        `Compte temporairement verrouillé. Réessayez dans ${minutesLeft} minute(s).`
      );
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      return forbidden('Votre compte a été désactivé. Contactez le support.');
    }

    // Comparer le mot de passe
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      const newAttempts = user.loginAttempts + 1;
      const updateData: { loginAttempts: number; lockedUntil?: Date } = {
        loginAttempts: newAttempts,
      };

      if (newAttempts >= MAX_ATTEMPTS) {
        updateData.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      const remaining = MAX_ATTEMPTS - newAttempts;
      void recordAudit({
        userId: user.id,
        action: 'auth.login_failed',
        entity: 'User',
        entityId: user.id,
        metadata: { attempts: newAttempts, locked: newAttempts >= MAX_ATTEMPTS },
        request,
      });
      return badRequest(
        remaining > 0
          ? `Mot de passe incorrect. ${remaining} tentative(s) restante(s).`
          : `Compte verrouillé pour ${LOCKOUT_MINUTES} minutes suite à trop de tentatives.`
      );
    }

    const failedBefore = user.loginAttempts;

    // Réinitialiser les tentatives et mettre à jour lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // Évaluation anti-fraude (§32) — nouvel appareil, burst d'échecs
    void assessEvent({ userId: user.id, context: 'login', request, recentFailedLogins: failedBefore });

    // Créer la session JWT
    const ipAddress = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined;
    const deviceInfo = request.headers.get('user-agent') ?? undefined;

    // MFA activée → renvoyer un défi au lieu des tokens
    if (user.twoFactorEnabled) {
      void recordAudit({ userId: user.id, action: 'auth.2fa_challenge', entity: 'User', entityId: user.id, request });
      return ok(
        { requires2fa: true, challengeToken: issue2faChallenge(user.id) },
        'Saisissez le code de votre application d\'authentification.'
      );
    }

    const payload = await buildSessionResponse(user, {
      ipAddress: ipAddress ?? undefined,
      deviceInfo,
    });

    void recordAudit({
      userId: user.id,
      action: 'auth.login',
      entity: 'User',
      entityId: user.id,
      metadata: { method: 'password' },
      request,
    });

    return ok(payload, 'Connexion réussie.');
  } catch (error) {
    logApiError('/v1/auth/login', error);
    return serverError();
  }
}
