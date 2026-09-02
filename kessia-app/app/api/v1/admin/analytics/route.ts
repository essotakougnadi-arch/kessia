// ============================================================
// KESSIA — GET /api/v1/admin/analytics  (§28, §17)
// KPI plateforme + priorités du jour (Admin Copilot).
// ============================================================

import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { computePlatformAnalytics } from '@/lib/analytics/platform';
import { computeAdminPriorities } from '@/lib/admin/copilot';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const [analytics, priorities] = await Promise.all([
      computePlatformAnalytics(),
      computeAdminPriorities(),
    ]);
    return ok({ analytics, priorities });
  } catch (e) {
    logApiError('/v1/admin/analytics', e);
    return serverError();
  }
}
