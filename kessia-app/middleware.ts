// ============================================================
// KESSIA — Middleware de protection des routes (edge)
// - vérifie la présence ET la validité du JWT (jose, compatible edge)
// - vérifie le rôle pour /admin (cahier des charges §31, §45)
// La sécurité réelle reste côté API (withAuth / withAuthAndRole).
// ============================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PROTECTED_ROUTES = [
  '/home', '/wallet', '/tontine', '/business', '/ai',
  '/support', '/profile', '/notifications', '/admin', '/marketplace',
  '/growth', '/simulator', '/calendar', '/trust', '/explore', '/documents',
  '/academy', '/community', '/jobs', '/invest', '/insurance', '/diaspora',
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
  const token = request.cookies.get('kessia-access-token')?.value;
  const claims = await readClaims(token);

  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  const isAdminRoute = pathname.startsWith('/admin');

  // Non connecté (ou token invalide) sur une route protégée → /login
  if (isProtected && !claims) {
    const url = new URL('/login', request.url);
    url.searchParams.set('from', pathname);
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete('kessia-access-token'); // nettoie un token mort
    return res;
  }

  // Rôle insuffisant sur /admin → /home
  if (isAdminRoute && claims && !ADMIN_ROLES.has(claims.role ?? '')) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  // Déjà connecté sur login/register → /home
  if (isAuthRoute && claims) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|public/).*)'],
};
