// ============================================================
// KESSIA — GET /api/v1/calendar  (cahier des charges §26)
// Agenda agrégé : cotisations, factures, plan de croissance, relances.
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { computeCalendar } from '@/lib/calendar/aggregate';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;
    return ok(await computeCalendar(context.userId));
  } catch (e) {
    logApiError('/v1/calendar', e);
    return serverError();
  }
}
