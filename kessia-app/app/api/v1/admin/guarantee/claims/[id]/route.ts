// ============================================================
// KESSIA — PATCH /api/v1/admin/guarantee/claims/[id]  (§45, §6.5)
// Décision sur une demande au Fonds de Garantie (rôles conformité).
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin, COMPLIANCE_ROLES } from '@/lib/auth/admin';
import { reviewClaim } from '@/lib/guarantee/guarantee.service';
import { ok, badRequest, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const schema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(500).default(''),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await requireAdmin(request, COMPLIANCE_ROLES);
    if (error || !context) return error ?? serverError();

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const res = await reviewClaim({
      claimId: params.id,
      decision: parsed.data.decision,
      note: parsed.data.note,
      reviewerId: context.userId,
    });
    if (!res.ok) return badRequest(res.error ?? 'Décision impossible.');

    return ok({ status: res.status }, parsed.data.decision === 'APPROVED' ? 'Demande approuvée (simulation).' : 'Demande refusée.');
  } catch (e) {
    logApiError('/v1/admin/guarantee/claims/[id]', e);
    return serverError();
  }
}
