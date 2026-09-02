// ============================================================
// KESSIA — GET /api/v1/ai/insights
// Smart Alerts : recommandations personnalisées dérivées des
// données réelles de l'utilisateur (cahier §5, §7, §22).
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { computeInsights } from '@/lib/insights/insights.service';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const insights = await computeInsights(context.userId);
    return ok({ insights });
  } catch (e) {
    logApiError('/v1/ai/insights', e);
    return serverError();
  }
}
