// ============================================================
// KESSIA — Code PIN de déverrouillage rapide (ADR 0041, item 1)
//   GET    → { enabled }
//   POST   { pin: "1234" } → active/change le PIN
//   DELETE → désactive le PIN
//
// ⚠️ Ce PIN ne remplace PAS l'authentification (mot de passe + 2FA) :
// il verrouille/déverrouille localement une session déjà authentifiée
// (voir /auth/pin/verify — aucun jeton n'est jamais émis ici). Objectif
// : un déverrouillage rapide de l'appli, comme sur un téléphone.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { recordAudit } from '@/lib/audit/audit.service';
import { ok, badRequest, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const pinSchema = z.object({ pin: z.string().regex(/^\d{4,6}$/, 'Le code doit contenir 4 à 6 chiffres.') });

export async function GET(request: NextRequest) {
  const { error, context } = await withAuth(request);
  if (error || !context) return error!;
  const user = await prisma.user.findUnique({ where: { id: context.userId }, select: { pinEnabled: true } });
  return ok({ enabled: !!user?.pinEnabled });
}

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const parsed = pinSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const pinHash = await bcrypt.hash(parsed.data.pin, 10);
    await prisma.user.update({
      where: { id: context.userId },
      data: { pinHash, pinEnabled: true },
    });
    void recordAudit({ userId: context.userId, action: 'auth.pin_enabled', entity: 'User', entityId: context.userId, request });
    return ok(null, 'Code PIN activé.');
  } catch (e) {
    logApiError('/v1/auth/pin', e);
    return serverError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const user = await prisma.user.findUnique({ where: { id: context.userId }, select: { pinEnabled: true } });
    if (!user?.pinEnabled) return badRequest('Le code PIN n\'est pas actif.');

    await prisma.user.update({ where: { id: context.userId }, data: { pinHash: null, pinEnabled: false } });
    void recordAudit({ userId: context.userId, action: 'auth.pin_disabled', entity: 'User', entityId: context.userId, request });
    return ok(null, 'Code PIN désactivé.');
  } catch (e) {
    logApiError('/v1/auth/pin', e);
    return serverError();
  }
}
