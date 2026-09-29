// ============================================================
// KESSIA — Middleware de protection des routes (edge)
// - vérifie la présence ET la validité du JWT (jose, compatible edge)
// - vérifie le rôle pour /admin (cahier des charges §31, §45)
// - P1.13-C : résout/valide le request-id de corrélation pour TOUTES
//   les routes (pages ET API — voir matcher élargi ci-dessous)
// La sécurité réelle reste côté API (withAuth / withAuthAndRole).
// ============================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/lib/observability/request-id';

const PROTECTED_ROUTES = [
  '/home', '/wallet', '/tontine', '/business', '/ai',
  '/support', '/profile', '/notifications', '/admin', '/marketplace',
  '/growth', '/simulator', '/calendar', '/trust', '/explore', '/documents',
  '/academy', '/community', '/jobs', '/invest', '/insurance', '/diaspora', '/loans',
];
const AUTH_ROUTES = ['/login', '/register', '/verify-otp', '/onboarding'];

const ADMIN_ROLES = new Set([
  'SUPER_ADMIN', 'ADMIN', 'COMPLIANCE', 'FINANCE', 'OPERATIONS', 'SUPPORT', 'MODERATOR', 'CONTENT_MANAGER', 'ANALYST',
]);

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');

type Claims = { sub: string; role?: string };

async function readClaims(token: string | undefined): Promise<Claims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as Claims;
  } catch {
    return null; // expiré / invalide → traité comme non connecté
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // P1.13-C — request-id résolu AVANT toute autre logique, pour TOUTES
  // les routes (pages ET API, cf. matcher élargi). Conserve un
  // x-request-id entrant s'il est un UUID v4 strictement valide, sinon
  // en génère un nouveau — jamais de "nettoyage" d'une valeur invalide,
  // jamais de valeur trop longue ou contenant des caractères de
  // contrôle (voir lib/observability/request-id.ts).
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  // Pose le header sur CHAQUE réponse retournée par ce middleware,
  // quel que soit le chemin de sortie (redirection ou passage).
  const withRequestId = (response: NextResponse): NextResponse => {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  };

  const token = request.cookies.get('kessia-access-token')?.value;
  const claims = await readClaims(token);

  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  const isAdminRoute = pathname.startsWith('/admin');

  // Non connecté (ou token invalide) sur une route protégée → /login
  // (routes /api/* : aucun préfixe de PROTECTED_ROUTES/AUTH_ROUTES ne
  // matche jamais un chemin commençant par /api — ce bloc reste donc
  // un no-op pour les routes API, qui gèrent leur propre auth via
  // withAuth/withAuthAndRole, cf. lib/auth/middleware.ts)
  if (isProtected && !claims) {
    const url = new URL('/login', request.url);
    url.searchParams.set('from', pathname);
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete('kessia-access-token'); // nettoie un token mort
    return withRequestId(res);
  }

  // Rôle insuffisant sur /admin → /home
  if (isAdminRoute && claims && !ADMIN_ROLES.has(claims.role ?? '')) {
    return withRequestId(NextResponse.redirect(new URL('/home', request.url)));
  }

  // Déjà connecté sur login/register → /home
  if (isAuthRoute && claims) {
    return withRequestId(NextResponse.redirect(new URL('/home', request.url)));
  }

  // Transmet le header au handler en aval (route API ou Server
  // Component) via la requête forwardée, en plus de la réponse.
  return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
