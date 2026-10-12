// ============================================================
// KESSIA — GET/PATCH /api/v1/admin/seller-verifications/[id]
// Revue d'un dossier de vérification fournisseur (COMPLIANCE_ROLES).
// PATCH { decision: 'APPROVED'|'REJECTED', rejectionReason?, expiresAt? }
// Chaque refus doit expliquer un motif exploitable.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin, COMPLIANCE_ROLES } from '@/lib/auth/admin';
import prisma from '@/lib/db/prisma';
import { reviewSellerVerification } from '@/lib/marketplace/seller-verification';
import { ok, badRequest, conflict, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().trim().max(500).optional(),
  // Renouvellement : fixé explicitement par l'admin, aucune durée par
  // défaut codée en dur (pas de règle de renouvellement imposée).
  expiresAt: z.string().datetime().optional(),
});

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { error } = await requireAdmin(request, COMPLIANCE_ROLES);
    if (error) return error;

    const verification = await prisma.sellerVerification.findUnique({
      where: { id: params.id },
      include: {
        business: { select: { id: true, name: true, phone: true, city: true, userId: true } },
        documents: true, // inclut fileUrl : réservé à la conformité
      },
    });
    if (!verification) return notFound('Dossier introuvable.');

    return ok(verification);
  } catch (e) {
    logApiError('/v1/admin/seller-verifications/[id]', e);
    return serverError();
  }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { error, context } = await requireAdmin(request, COMPLIANCE_ROLES);
    if (error || !context) return error!;

    const parsed = reviewSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { decision, rejectionReason, expiresAt } = parsed.data;

    if (decision === 'REJECTED' && !rejectionReason) {
      return badRequest('Un motif exploitable est obligatoire pour un refus.');
    }

    const result = await reviewSellerVerification(params.id, context.userId, decision, {
      rejectionReason,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    if (!result.ok) {
      switch (result.code) {
        case 'NOT_FOUND': return notFound(result.error);
        case 'CONFLICT': return conflict(result.error);
        default: return badRequest(result.error);
      }
    }

    return ok({ status: result.status }, 'Décision enregistrée. Le fournisseur a été notifié.');
  } catch (e) {
    logApiError('/v1/admin/seller-verifications/[id]', e);
    return serverError();
  }
}
