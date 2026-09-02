// ============================================================
// KESSIA — GET/POST /api/v1/kyc
// Statut KYC + Initier un cas KYC
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, created, serverError, conflict } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { recordAudit } from '@/lib/audit/audit.service';

export const dynamic = 'force-dynamic';

// ---- GET : Statut KYC de l'utilisateur ----

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: { kycStatus: true, kycLevel: true },
    });

    const kycCase = await prisma.kycCase.findFirst({
      where: { userId: context.userId },
      include: {
        // ⚠️ ne jamais renvoyer fileUrl (data-URI lourde) au client
        documents: {
          orderBy: { uploadedAt: 'desc' },
          select: { id: true, type: true, status: true, uploadedAt: true, notes: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return ok({
      kycStatus: user?.kycStatus ?? 'NOT_STARTED',
      kycLevel: user?.kycLevel ?? 0,
      activeCase: kycCase
        ? {
            id: kycCase.id,
            status: kycCase.status,
            level: kycCase.level,
            rejectionReason: kycCase.rejectionReason,
            submittedAt: kycCase.submittedAt,
            reviewedAt: kycCase.reviewedAt,
            documents: kycCase.documents,
          }
        : null,
      // Exigences par niveau
      requirements: {
        level1: ['NATIONAL_ID ou PASSPORT', 'SELFIE'],
        level2: ['PROOF_OF_ADDRESS'],
        level3: ['Vérification avancée (entretien)'],
      },
    });
  } catch (error) {
    logApiError('/v1/kyc', error);
    return serverError();
  }
}

// ---- POST : Initier un cas KYC ----

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    // Vérifier qu'il n'y a pas déjà un cas en cours
    const existingCase = await prisma.kycCase.findFirst({
      where: {
        userId: context.userId,
        status: { in: ['IN_PROGRESS', 'UNDER_REVIEW'] },
      },
    });

    if (existingCase) {
      return conflict('Vous avez déjà un dossier KYC en cours de traitement.');
    }

    // Créer un nouveau cas KYC
    const kycCase = await prisma.$transaction(async (tx) => {
      const newCase = await tx.kycCase.create({
        data: {
          userId: context.userId,
          status: 'IN_PROGRESS',
          level: 1,
        },
      });

      // Mettre à jour le statut KYC de l'utilisateur
      await tx.user.update({
        where: { id: context.userId },
        data: { kycStatus: 'IN_PROGRESS' },
      });

      return newCase;
    });

    void recordAudit({
      userId: context.userId,
      action: 'kyc.case_opened',
      entity: 'KycCase',
      entityId: kycCase.id,
      metadata: { level: kycCase.level },
      request,
    });

    return created(
      { caseId: kycCase.id, status: kycCase.status, level: kycCase.level },
      'Dossier KYC initié. Vous pouvez maintenant soumettre vos documents.'
    );
  } catch (error) {
    logApiError('/v1/kyc', error);
    return serverError();
  }
}
