// ============================================================
// KESSIA — POST /api/v1/auth/refresh
// Rotation du refresh token → nouveaux tokens JWT
//
// P0.2 : le refresh token ne transite plus par le corps de la requête
// (il ne touche plus jamais le JS du navigateur) — il est lu depuis le
// cookie HttpOnly `kessia-refresh-token` (path /api/v1/auth/refresh),
// envoyé automatiquement par le navigateur. Un `refreshToken` dans le
// corps reste accepté en repli (clients non-navigateur, tests) mais le
// cookie est prioritaire.
// ============================================================

import { NextRequest } from 'next/server';
import { refreshTokenSchema } from '@/lib/validations/auth';
import { rotateRefreshToken } from '@/lib/auth/session';
import { setAuthCookies, REFRESH_COOKIE } from '@/lib/auth/cookies';
import { ok, unauthorized, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const fromCookie = request.cookies.get(REFRESH_COOKIE)?.value;

    let refreshToken = fromCookie;
    if (!refreshToken) {
      const body = await request.json().catch(() => ({}));
      const parsed = refreshTokenSchema.safeParse(body);
      if (!parsed.success) {
        return validationError(parsed.error);
      }
      refreshToken = parsed.data.refreshToken;
    }

    const result = await rotateRefreshToken(refreshToken);

    if (!result) {
      return unauthorized('Refresh token invalide ou expiré. Veuillez vous reconnecter.');
    }

    const res = ok(
      {
        accessToken: result.accessToken,
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
    setAuthCookies(res, request, { accessToken: result.accessToken, refreshToken: result.refreshToken });
    return res;
  } catch (error) {
    logApiError('/v1/auth/refresh', error);
    return serverError();
  }
}
