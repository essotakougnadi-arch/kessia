// ============================================================
// KESSIA — GET /api/v1/admin/fraud  (cahier des charges §32, §45)
// File d'alertes anti-fraude — revue humaine.
// ============================================================

import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { requireAdmin, COMPLIANCE_ROLES } from '@/lib/auth/admin';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import type { FraudAlertStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin(request, COMPLIANCE_ROLES);
    if (error) return error;

    const status = new URL(request.url).searchParams.get('status') as FraudAlertStatus | null;

    const [alerts, counts] = await Promise.all([
      prisma.fraudAlert.findMany({
        where: status ? { status } : undefined,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 100,
        include: { user: { select: { firstName: true, lastName: true, phone: true } } },
      }),
      prisma.fraudAlert.groupBy({ by: ['status'], _count: true }),
    ]);

    const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>;

    return ok({
      summary: {
        open: byStatus.OPEN ?? 0,
        reviewing: byStatus.REVIEWING ?? 0,
        confirmed: byStatus.CONFIRMED ?? 0,
        dismissed: byStatus.DISMISSED ?? 0,
      },
      alerts: alerts.map((a) => ({
        id: a.id,
        user: a.user,
        riskLevel: a.riskLevel,
        score: a.score,
        signals: a.signals,
        context: a.context,
        entityId: a.entityId,
        status: a.status,
        decisionNote: a.decisionNote,
        createdAt: a.createdAt,
        reviewedAt: a.reviewedAt,
      })),
    });
  } catch (e) {
    logApiError('/v1/admin/fraud', e);
    return serverError();
  }
}
