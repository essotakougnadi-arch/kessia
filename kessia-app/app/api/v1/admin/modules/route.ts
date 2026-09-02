// ============================================================
// KESSIA — GET /api/v1/admin/modules  (§45, §54)
// Demande d'intérêt agrégée par module (KPI produit).
// ============================================================

import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/auth/admin';
import { UPCOMING_MODULES } from '@/lib/modules/catalog';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const grouped = await prisma.moduleInterest.groupBy({
      by: ['module'], _count: { _all: true },
    });
    const total = await prisma.moduleInterest.count();
    const countBy = Object.fromEntries(grouped.map((g) => [g.module, g._count._all]));

    return ok({
      total,
      modules: UPCOMING_MODULES.map((m) => ({
        key: m.key, name: m.name, status: m.status, ref: m.ref,
        interested: countBy[m.key] ?? 0,
      })).sort((a, b) => b.interested - a.interested),
    });
  } catch (e) {
    logApiError('/v1/admin/modules', e);
    return serverError();
  }
}
