// ============================================================
// KESSIA — POST /api/v1/auth/logout
// Déconnexion — révoque la session courante
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { revokeSession, extractBearerToken } from '@/lib/auth/session';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { recordAudit } from '@/lib/audit/audit.service';

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error) return error;

    const token = extractBearerToken(request.headers.get('authorization'));
    if (token) {
      await revokeSession(token);
    }

    void recordAudit({
      userId: context?.userId,
      action: 'auth.logout',
      entity: 'User',
      entityId: context?.userId,
      request,
    });

    return ok(null, 'Déconnexion réussie.');
  } catch (error) {
    logApiError('/v1/auth/logout', error);
    return serverError();
  }
}
