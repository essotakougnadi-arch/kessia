// ============================================================
// KESSIA — GET /api/v1/admin/seller-verifications
// Liste des dossiers de vérification fournisseur (même garde que
// /admin/kyc : COMPLIANCE_ROLES).
// ============================================================

import { NextRequest } from 'next/server';
import { requireAdmin, COMPLIANCE_ROLES } from '@/lib/auth/admin';
import prisma from '@/lib/db/prisma';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin(request, COMPLIANCE_ROLES);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'PENDING_REVIEW';

    const verifications = await prisma.sellerVerification.findMany({
      where: status === 'ALL' ? {} : { status: status as never },
      orderBy: { submittedAt: 'asc' },
      take: 50,
      include: {
        business: { select: { id: true, name: true, phone: true, city: true, userId: true } },
        documents: { select: { id: true, type: true, label: true, status: true, uploadedAt: true } },
      },
    });

    return ok(
      verifications.map((v) => ({
        id: v.id,
        status: v.status,
        submittedAt: v.submittedAt,
        reviewedAt: v.reviewedAt,
        rejectionReason: v.rejectionReason,
        expiresAt: v.expiresAt,
        business: v.business,
        documents: v.documents,
      }))
    );
  } catch (e) {
    logApiError('/v1/admin/seller-verifications', e);
    return serverError();
  }
}
