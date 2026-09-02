// ============================================================
// KESSIA — GET /api/v1/admin/guarantee  (§45, §6.5)
// Fonds de Garantie Solidaire — back-office (rôles conformité).
// ⚠️ MODE DÉMONSTRATION. Voir ADR 0010.
// ============================================================

import { NextRequest } from 'next/server';
import { requireAdmin, COMPLIANCE_ROLES } from '@/lib/auth/admin';
import { getFundProjection, getAllClaims, getRecentEvents } from '@/lib/guarantee/guarantee.service';
import { GUARANTEE_RULES } from '@/lib/guarantee/rules';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin(request, COMPLIANCE_ROLES);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as never;

    const [fund, claims, events] = await Promise.all([
      getFundProjection(),
      getAllClaims(status || undefined),
      getRecentEvents(50),
    ]);

    return ok({
      mode: 'SIMULATION',
      rules: GUARANTEE_RULES,
      fund,
      claims: claims.map((c) => ({
        id: c.id,
        user: c.user,
        tontineId: c.tontineId,
        round: c.round,
        amount: Number(c.amountRequested),
        reason: c.reason,
        status: c.status,
        decisionNote: c.decisionNote,
        createdAt: c.createdAt,
        reviewedAt: c.reviewedAt,
      })),
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        amount: e.amount ? Number(e.amount) : null,
        at: e.createdAt,
        metadata: e.metadata,
      })),
    });
  } catch (e) {
    logApiError('/v1/admin/guarantee', e);
    return serverError();
  }
}
