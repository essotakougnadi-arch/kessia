// ============================================================
// KESSIA — POST /api/v1/guarantee/claims
// Ouvrir une demande au Fonds de Garantie Solidaire (§6.5).
// ⚠️ MODE DÉMONSTRATION. Le formulaire n'est proposé que si
// GUARANTEE_FUND_USER_REQUESTS=1 (démo). Voir ADR 0010.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { openClaim } from '@/lib/guarantee/guarantee.service';
import { userRequestsEnabled } from '@/lib/guarantee/rules';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { ok, badRequest, forbidden, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const schema = z.object({
  tontineId: z.string().min(1),
  round: z.number().int().positive(),
  reason: z.string().min(10, 'Expliquez brièvement votre situation.').max(500),
});

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    if (!userRequestsEnabled()) {
      return forbidden("Le Fonds de Garantie Solidaire n'est pas encore ouvert aux demandes.");
    }

    const limited = await enforceRateLimit(request, 'guarantee.claim', { limit: 3, windowMs: 60 * 60_000, by: context.userId });
    if (limited) return limited;

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const res = await openClaim({ userId: context.userId, ...parsed.data });
    if (!res.ok) return badRequest(res.error ?? 'Demande impossible.');

    return ok(
      { claimId: res.claimId },
      'Demande enregistrée. Notre équipe conformité l’examinera (mode démonstration — aucun mouvement de fonds réel).'
    );
  } catch (e) {
    logApiError('/v1/guarantee/claims', e);
    return serverError();
  }
}
