// ============================================================
// KESSIA — GET /api/v1/score
// KESSIA Score de l'utilisateur connecté + explication détaillée.
// Recalculé à la demande (modèle déterministe à base de règles) et
// persisté dans UserProfile.kessiaScore pour les affichages existants.
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { computeKessiaScore } from '@/lib/score/score.service';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const result = await computeKessiaScore(context.userId);

    // Synchronise la valeur numérique (best-effort, non bloquant)
    prisma.userProfile
      .upsert({
        where: { userId: context.userId },
        create: { userId: context.userId, kessiaScore: result.score },
        update: { kessiaScore: result.score },
      })
      .catch((e) => logApiError('/v1/score:persist', e));

    return ok(result);
  } catch (e) {
    logApiError('/v1/score', e);
    return serverError();
  }
}
