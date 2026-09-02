// ============================================================
// KESSIA — Middleware d'authentification API
// Protège les routes API avec vérification JWT
// ============================================================

import { NextRequest } from 'next/server';
import { verifyAccessToken, extractBearerToken, type JwtPayload } from './session';
import { unauthorized, forbidden } from '../utils/response';
import type { UserRole } from '@prisma/client';

export type AuthContext = {
  userId: string;
  phone: string;
  role: UserRole;
};

/**
 * Middleware d'auth — extrait et vérifie le JWT depuis l'en-tête Authorization.
 * Retourne { error, context } : si error != null, renvoyer la response directement.
 */
export async function withAuth(
  request: NextRequest
): Promise<{ error: ReturnType<typeof unauthorized> | null; context: AuthContext | null }> {
  const authHeader = request.headers.get('authorization');
  // En-tête Bearer d'abord (appels `apiClient`). Repli sur le cookie
  // `kessia-access-token` UNIQUEMENT pour les GET — permet la navigation
  // directe du navigateur vers un document (PDF), sans surface CSRF
  // (une requête d'écriture exige toujours l'en-tête).
  const token =
    extractBearerToken(authHeader) ??
    (request.method === 'GET' ? request.cookies.get('kessia-access-token')?.value ?? null : null);

  if (!token) {
    return { error: unauthorized('Token manquant'), context: null };
  }

  const payload = verifyAccessToken(token);

  if (!payload) {
    return { error: unauthorized('Token invalide ou expiré'), context: null };
  }

  return {
    error: null,
    context: {
      userId: payload.sub,
      phone: payload.phone,
      role: payload.role as UserRole,
    },
  };
}

/**
 * Middleware d'auth avec vérification de rôle(s)
 */
export async function withAuthAndRole(
  request: NextRequest,
  allowedRoles: UserRole[]
): Promise<{ error: ReturnType<typeof unauthorized> | ReturnType<typeof forbidden> | null; context: AuthContext | null }> {
  const { error, context } = await withAuth(request);

  if (error || !context) {
    return { error, context: null };
  }

  if (!allowedRoles.includes(context.role)) {
    return {
      error: forbidden(`Accès réservé aux rôles : ${allowedRoles.join(', ')}`),
      context: null,
    };
  }

  return { error: null, context };
}

/**
 * Vérifie qu'un utilisateur accède uniquement à ses propres ressources
 */
export function assertOwnership(
  context: AuthContext,
  resourceOwnerId: string
): boolean {
  return (
    context.userId === resourceOwnerId ||
    context.role === 'ADMIN' ||
    context.role === 'SUPER_ADMIN'
  );
}
