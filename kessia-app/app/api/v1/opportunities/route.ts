// ============================================================
// KESSIA — GET /api/v1/opportunities  (cahier des charges §17)
// Opportunités concrètes dérivées des données de l'utilisateur.
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { computeOpportunities } from '@/lib/opportunities/engine';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;
    return ok({ opportunities: await computeOpportunities(context.userId) });
  } catch (e) {
    logApiError('/v1/opportunities', e);
    return serverError();
  }
}
