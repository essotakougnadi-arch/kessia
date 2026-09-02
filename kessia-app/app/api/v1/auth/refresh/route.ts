// ============================================================
// KESSIA — POST /api/v1/auth/refresh
// Rotation du refresh token → nouveaux tokens JWT
// ============================================================

import { NextRequest } from 'next/server';
import { refreshTokenSchema } from '@/lib/validations/auth';
import { rotateRefreshToken } from '@/lib/auth/session';
import { ok, unauthorized, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = refreshTokenSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { refreshToken } = parsed.data;
    const result = await rotateRefreshToken(refreshToken);

    if (!result) {
      return unauthorized('Refresh token invalide ou expiré. Veuillez vous reconnecter.');
    }

    return ok(
      {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: {
          id: result.user.id,
          phone: result.user.phone,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role,
        },
      },
      'Tokens renouvelés.'
    );
  } catch (error) {
    logApiError('/v1/auth/refresh', error);
    return serverError();
  }
}
