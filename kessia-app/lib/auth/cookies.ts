// ============================================================
// KESSIA — Cookies d'authentification (P0.2)
//
// Posés côté serveur, HttpOnly (illisibles/inscriptibles en JS — la
// mitigation XSS principale de ce correctif). `kessia-access-token`
// existait déjà (posé auparavant côté client via `document.cookie`,
// non-HttpOnly — lu par `middleware.ts` et `withAuth` en repli GET) ;
// il est conservé sous le même nom pour ne pas toucher ces lecteurs,
// mais n'est plus jamais écrit côté client. `kessia-refresh-token` est
// nouveau : le refresh token (jeton le plus sensible, 30 j) n'est
// désormais JAMAIS exposé au JavaScript du navigateur, ni en
// localStorage ni en réponse JSON lisible — voir refresh/route.ts.
// ============================================================

import type { NextRequest, NextResponse } from 'next/server';

export const ACCESS_COOKIE = 'kessia-access-token';
export const REFRESH_COOKIE = 'kessia-refresh-token';

const ACCESS_MAX_AGE = 15 * 60; // 15 min (durée de l'access token)
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60; // 30 jours

// L'attribut `Secure` doit refléter le protocole RÉEL de la requête, pas
// `NODE_ENV` : `next start` (utilisé par les tests E2E isolés et en local)
// tourne en `NODE_ENV=production` tout en servant du HTTP simple sur
// localhost — un cookie `Secure` y serait silencieusement rejeté par le
// navigateur (comme en HTTPS réel), cassant toute l'authentification.
function isHttps(request: NextRequest): boolean {
  return request.nextUrl.protocol === 'https:';
}

export function setAuthCookies(
  res: NextResponse,
  request: NextRequest,
  tokens: { accessToken: string; refreshToken: string }
): void {
  const secure = isHttps(request);
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_MAX_AGE,
  });
  // Path restreint : ce cookie n'est envoyé par le navigateur qu'à l'appel
  // de POST /api/v1/auth/refresh — jamais exposé aux autres routes.
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/v1/auth/refresh',
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearAuthCookies(res: NextResponse, request: NextRequest): void {
  const secure = isHttps(request);
  res.cookies.set(ACCESS_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  res.cookies.set(REFRESH_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/v1/auth/refresh',
    maxAge: 0,
  });
}
