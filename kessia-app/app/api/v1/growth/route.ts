// ============================================================
// KESSIA — GET /api/v1/growth  (cahier des charges §23)
// Plan de croissance calculé + progression de l'utilisateur.
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { computeGrowthPlan } from '@/lib/growth/plan';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;
    return ok(await computeGrowthPlan(context.userId));
  } catch (e) {
    logApiError('/v1/growth', e);
    return serverError();
  }
}
