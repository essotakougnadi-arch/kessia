// ============================================================
// KESSIA — GET/POST /api/v1/business/[id]/verification
//   GET  : état du dossier de vérification fournisseur (propriétaire)
//   POST : soumission (ou resoumission) des documents
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { requireBusinessOwner } from '@/lib/business/access';
import { submitSellerVerification, isSellerVerifiedBadgeActive } from '@/lib/marketplace/seller-verification';
import { imageDataUri } from '@/lib/validations/marketplace';
import { ok, created, badRequest, conflict, forbidden, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const documentTypes = ['BUSINESS_REGISTRATION', 'TAX_ID', 'OWNER_ID', 'PROOF_OF_ADDRESS', 'OTHER'] as const;

const submitSchema = z.object({
  documents: z
    .array(
      z.object({
        type: z.enum(documentTypes),
        label: z.string().trim().max(120).optional(),
        fileUrl: imageDataUri,
      })
    )
    .min(1, 'Au moins un document est requis.')
    .max(10, 'Maximum 10 documents par soumission.'),
});

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const verification = await prisma.sellerVerification.findUnique({
      where: { businessId: params.id },
      include: { documents: { select: { id: true, type: true, label: true, status: true, uploadedAt: true } } },
    });

    return ok({
      status: verification?.status ?? 'NOT_SUBMITTED',
      submittedAt: verification?.submittedAt ?? null,
      reviewedAt: verification?.reviewedAt ?? null,
      rejectionReason: verification?.rejectionReason ?? null,
      expiresAt: verification?.expiresAt ?? null,
      documents: verification?.documents ?? [],
      badgeActive: isSellerVerifiedBadgeActive(verification),
    });
  } catch (e) {
    logApiError('/v1/business/[id]/verification GET', e);
    return serverError();
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const parsed = submitSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const result = await submitSellerVerification(params.id, auth.userId, parsed.data.documents);
    if (!result.ok) {
      switch (result.code) {
        case 'NOT_FOUND': return notFound(result.error);
        case 'FORBIDDEN': return forbidden(result.error);
        case 'CONFLICT': return conflict(result.error);
        default: return badRequest(result.error);
      }
    }

    return created(
      { verificationId: result.verificationId, status: result.status },
      'Dossier de vérification soumis — en attente d\'examen.'
    );
  } catch (e) {
    logApiError('/v1/business/[id]/verification POST', e);
    return serverError();
  }
}
