// ============================================================
// KESSIA — GET/POST/DELETE /api/v1/business/[id]/goals  (§7)
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { requireBusinessOwner } from '@/lib/business/access';
import { computeGoalProgress, periodBounds } from '@/lib/business/goals';
import { ok, created, badRequest, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const schema = z.object({
  metric: z.enum(['REVENUE', 'MARGIN_RATE', 'SALES_COUNT', 'NEW_CUSTOMERS']),
  period: z.enum(['MONTH', 'QUARTER', 'YEAR']),
  targetValue: z.number().positive('Objectif invalide'),
  label: z.string().max(120).optional(),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;
    return ok({ goals: await computeGoalProgress(params.id) });
  } catch (e) {
    logApiError('/v1/business/[id]/goals', e);
    return serverError();
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const count = await prisma.businessGoal.count({ where: { businessId: params.id } });
    if (count >= 6) return badRequest('Maximum 6 objectifs par entreprise.');

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { metric, period, targetValue, label } = parsed.data;
    if (metric === 'MARGIN_RATE' && targetValue > 100) return badRequest('Un taux de marge ne dépasse pas 100 %.');

    const { start, end } = periodBounds(period);
    const goal = await prisma.businessGoal.create({
      data: { businessId: params.id, metric, period, targetValue, label, startDate: start, endDate: end },
    });
    return created({ id: goal.id }, 'Objectif ajouté.');
  } catch (e) {
    logApiError('/v1/business/[id]/goals', e);
    return serverError();
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const goalId = new URL(request.url).searchParams.get('goalId');
    if (!goalId) return badRequest('goalId requis.');
    const g = await prisma.businessGoal.findFirst({ where: { id: goalId, businessId: params.id }, select: { id: true } });
    if (!g) return notFound('Objectif introuvable.');
    await prisma.businessGoal.delete({ where: { id: goalId } });
    return ok(null, 'Objectif supprimé.');
  } catch (e) {
    logApiError('/v1/business/[id]/goals', e);
    return serverError();
  }
}
