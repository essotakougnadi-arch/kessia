// ============================================================
// KESSIA — GET /api/v1/business/[id]/treasury  (§7)
// ============================================================

import { NextRequest } from 'next/server';
import { requireBusinessOwner } from '@/lib/business/access';
import { computeTreasury } from '@/lib/business/treasury';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;
    return ok(await computeTreasury(params.id));
  } catch (e) {
    logApiError('/v1/business/[id]/treasury', e);
    return serverError();
  }
}
