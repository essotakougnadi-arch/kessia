// ============================================================
// KESSIA — GET /api/v1/business/[id]/dna  (cahier des charges §8)
// ============================================================

import { NextRequest } from 'next/server';
import { requireBusinessOwner } from '@/lib/business/access';
import { computeBusinessDNA } from '@/lib/business/dna';
import { ok, notFound, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;
    const dna = await computeBusinessDNA(params.id);
    if (!dna) return notFound('Business introuvable.');
    return ok(dna);
  } catch (e) {
    logApiError('/v1/business/[id]/dna', e);
    return serverError();
  }
}
