// ============================================================
// KESSIA — GET/PATCH /api/v1/admin/kyc/[id]
// Revue d'un dossier KYC (cahier des charges §30, §45).
// PATCH { decision: 'VERIFIED'|'REJECTED'|'ACTION_REQUIRED', reason?, level? }
// Chaque rejet doit expliquer clairement la raison exploitable (§30).
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin, COMPLIANCE_ROLES } from '@/lib/auth/admin';
import prisma from '@/lib/db/prisma';
import { recordAudit } from '@/lib/audit/audit.service';
import { kycDocumentUrl } from '@/lib/storage/kyc-storage';
import { ok, badRequest, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const reviewSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED', 'ACTION_REQUIRED']),
  reason: z.string().max(500).optional(),
  level: z.number().int().min(1).max(3).optional(),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireAdmin(request, COMPLIANCE_ROLES);
    if (error) return error;

    const kycCase = await prisma.kycCase.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        documents: true, // inclut fileUrl : réservé à la conformité
      },
    });
    if (!kycCase) return notFound('Dossier introuvable.');

    // Pièce stockée dans le bucket privé → URL signée courte durée ;
    // sinon repli data-URI. Réservé à la conformité.
    const documents = await Promise.all(
      kycCase.documents.map(async (d) => ({
        id: d.id, type: d.type, status: d.status, notes: d.notes, uploadedAt: d.uploadedAt,
        fileUrl: d.storageKey ? (await kycDocumentUrl(d.storageKey)) ?? '' : d.fileUrl,
      }))
    );

    return ok({ ...kycCase, documents });
  } catch (e) {
    logApiError('/v1/admin/kyc/[id]', e);
    return serverError();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await requireAdmin(request, COMPLIANCE_ROLES);
    if (error || !context) return error!;

    const parsed = reviewSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { decision, reason, level } = parsed.data;

    if ((decision === 'REJECTED' || decision === 'ACTION_REQUIRED') && !reason?.trim()) {
      return badRequest('Un motif exploitable est obligatoire pour un rejet ou une demande d\'action.');
    }

    const kycCase = await prisma.kycCase.findUnique({ where: { id: params.id } });
    if (!kycCase) return notFound('Dossier introuvable.');

    const nextLevel = decision === 'VERIFIED' ? (level ?? kycCase.level) : kycCase.level;

    await prisma.$transaction([
      prisma.kycCase.update({
        where: { id: params.id },
        data: {
          status: decision,
          rejectionReason: decision === 'VERIFIED' ? null : reason,
          reviewedById: context.userId,
          reviewedAt: new Date(),
          completedAt: decision === 'VERIFIED' ? new Date() : null,
          level: nextLevel,
        },
      }),
      prisma.user.update({
        where: { id: kycCase.userId },
        data: {
          kycStatus: decision,
          ...(decision === 'VERIFIED' ? { kycLevel: nextLevel } : {}),
        },
      }),
      prisma.notification.create({
        data: {
          userId: kycCase.userId,
          category: 'SECURITY',
          priority: decision === 'VERIFIED' ? 'NORMAL' : 'HIGH',
          title:
            decision === 'VERIFIED' ? 'Identité vérifiée ✅'
            : decision === 'REJECTED' ? 'Vérification KYC rejetée'
            : 'Vérification KYC : action requise',
          body:
            decision === 'VERIFIED'
              ? `Votre identité est vérifiée (niveau ${nextLevel}). Toutes les fonctionnalités sont débloquées.`
              : reason!,
          actionUrl: '/profile/kyc',
        },
      }),
    ]);

    void recordAudit({
      userId: context.userId,
      action: `kyc.review_${decision.toLowerCase()}`,
      entity: 'KycCase',
      entityId: params.id,
      metadata: { subjectUserId: kycCase.userId, decision, reason: reason ?? null, level: nextLevel },
      request,
    });

    return ok({ status: decision }, 'Décision enregistrée. L\'utilisateur a été notifié.');
  } catch (e) {
    logApiError('/v1/admin/kyc/[id]', e);
    return serverError();
  }
}
