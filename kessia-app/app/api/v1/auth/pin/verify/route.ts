// ============================================================
// KESSIA — POST /api/v1/auth/pin/verify  (ADR 0041, item 1)
// Vérifie le code PIN d'une session DÉJÀ authentifiée (déverrouillage
// local uniquement — aucun jeton émis, aucune élévation de droits).
// Fortement limité en débit : un PIN à 4 chiffres n'a que 10 000
// combinaisons, il ne doit jamais être brute-forçable.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';
import { ok, badRequest, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ pin: z.string().min(4).max(6) });

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'auth.pin_verify', { limit: 5, windowMs: 15 * 60_000 });
    if (limited) return limited;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const user = await prisma.user.findUnique({ where: { id: context.userId }, select: { pinHash: true, pinEnabled: true } });
    if (!user?.pinEnabled || !user.pinHash) return badRequest('Le code PIN n\'est pas actif.');

    const valid = await bcrypt.compare(parsed.data.pin, user.pinHash);
    if (!valid) {
      void recordAudit({ userId: context.userId, action: 'auth.pin_verify_failed', entity: 'User', entityId: context.userId, request });
      return badRequest('Code incorrect.');
    }
    return ok({ valid: true });
  } catch (e) {
    logApiError('/v1/auth/pin/verify', e);
    return serverError();
  }
}
