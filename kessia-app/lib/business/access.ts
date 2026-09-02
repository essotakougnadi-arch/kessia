// ============================================================
// KESSIA — Contrôle d'accès aux ressources d'un business (§7, §45)
// ============================================================

import type { NextRequest } from 'next/server';
import { withAuth, assertOwnership } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { notFound, forbidden } from '@/lib/utils/response';

/**
 * Authentifie et vérifie que l'utilisateur est propriétaire du business.
 * Renvoie `{ error }` (réponse HTTP prête) ou `{ userId, businessId }`.
 */
export async function requireBusinessOwner(request: NextRequest, businessId: string) {
  const { error, context } = await withAuth(request);
  if (error || !context) return { error: error! };

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { userId: true, status: true, name: true },
  });
  if (!business) return { error: notFound('Business introuvable.') };
  if (!assertOwnership(context, business.userId)) return { error: forbidden() };

  return { userId: context.userId, businessId, businessName: business.name };
}
