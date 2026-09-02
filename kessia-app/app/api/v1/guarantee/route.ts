// ============================================================
// KESSIA — GET /api/v1/guarantee
// Fonds de Garantie Solidaire — vue utilisateur (§6.5).
// ⚠️ MODE DÉMONSTRATION : le solde est une projection, aucun
// mouvement de fonds réel. Voir ADR 0010.
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { getFundProjection, checkEligibility, getUserClaims } from '@/lib/guarantee/guarantee.service';
import { GUARANTEE_RULES, userRequestsEnabled } from '@/lib/guarantee/rules';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const [fund, eligibility, claims] = await Promise.all([
      getFundProjection(),
      checkEligibility(context.userId),
      getUserClaims(context.userId),
    ]);

    return ok({
      mode: 'SIMULATION',
      requestsEnabled: userRequestsEnabled(),
      rules: {
        allocationRatePct: GUARANTEE_RULES.allocationRateBps / 100,
        minOnTimeContributions: GUARANTEE_RULES.eligibility.minOnTimeContributions,
        minMembershipDays: GUARANTEE_RULES.eligibility.minMembershipDays,
        maxApprovedClaimsPerYear: GUARANTEE_RULES.limits.maxApprovedClaimsPerYear,
        kycVerified: GUARANTEE_RULES.eligibility.kycVerified,
      },
      fund,
      eligibility,
      claims: claims.map((c) => ({
        id: c.id,
        tontineId: c.tontineId,
        round: c.round,
        amount: Number(c.amountRequested),
        reason: c.reason,
        status: c.status,
        decisionNote: c.decisionNote,
        createdAt: c.createdAt,
        reviewedAt: c.reviewedAt,
      })),
    });
  } catch (e) {
    logApiError('/v1/guarantee', e);
    return serverError();
  }
}
