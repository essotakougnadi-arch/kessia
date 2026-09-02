// ============================================================
// KESSIA — PATCH /api/v1/growth/steps/[key]  (§23)
// Met à jour la progression d'une étape du plan de croissance.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { setGrowthStepStatus } from '@/lib/growth/plan';
import { recordAudit } from '@/lib/audit/audit.service';
import { ok, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const schema = z.object({
  status: z.enum(['TODO', 'DOING', 'DONE', 'SKIPPED']),
  note: z.string().max(500).optional().or(z.literal('')),
});

export async function PATCH(request: NextRequest, { params }: { params: { key: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const key = params.key.slice(0, 120);
    const note = parsed.data.note === undefined ? undefined : parsed.data.note || null;
    await setGrowthStepStatus(context.userId, key, parsed.data.status, note);

    void recordAudit({
      userId: context.userId,
      action: 'growth.step_updated',
      entity: 'GrowthStepState',
      entityId: key,
      metadata: { status: parsed.data.status },
      request,
    });

    return ok({ key, status: parsed.data.status }, 'Étape mise à jour.');
  } catch (e) {
    logApiError('/v1/growth/steps/[key]', e);
    return serverError();
  }
}
