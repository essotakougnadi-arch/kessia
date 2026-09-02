// ============================================================
// KESSIA — GET/POST /api/v1/kyc/documents
// Soumission des pièces KYC (cahier des charges §30)
//
// Stockage : Supabase Storage (bucket privé) + URL signées si
// configuré ; sinon repli data-URI en base. Voir ADR 0003 / 0014.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, created, badRequest, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';
import { kycStorageEnabled, storeKycDocument, removeKycDocuments } from '@/lib/storage/kyc-storage';

export const dynamic = 'force-dynamic';

const MAX_DATA_URL = 3_500_000; // ~2,5 Mo de fichier après base64

const submitSchema = z.object({
  type: z.enum([
    'NATIONAL_ID',
    'PASSPORT',
    'DRIVER_LICENSE',
    'RESIDENCE_PERMIT',
    'SELFIE',
    'PROOF_OF_ADDRESS',
  ]),
  dataUrl: z
    .string()
    .startsWith('data:image/', 'Le fichier doit être une image.')
    .max(MAX_DATA_URL, 'Fichier trop lourd (max ~2,5 Mo).'),
});

// Pièces minimales pour passer en revue (niveau 1)
const ID_DOCS = ['NATIONAL_ID', 'PASSPORT', 'DRIVER_LICENSE', 'RESIDENCE_PERMIT'];

async function activeCaseFor(userId: string) {
  return prisma.kycCase.findFirst({
    where: { userId, status: { in: ['IN_PROGRESS', 'ACTION_REQUIRED'] } },
    include: { documents: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const kycCase = await prisma.kycCase.findFirst({
      where: { userId: context.userId },
      include: { documents: { orderBy: { uploadedAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });

    return ok(kycCase?.documents ?? []);
  } catch (e) {
    logApiError('/v1/kyc/documents', e);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'kyc.document', {
      limit: 20, windowMs: 10 * 60_000, by: context.userId,
    });
    if (limited) return limited;

    const body = await request.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const { type, dataUrl } = parsed.data;

    let kycCase = await activeCaseFor(context.userId);

    // Pas de dossier ouvert → en créer un (comme POST /kyc)
    if (!kycCase) {
      const newCase = await prisma.$transaction(async (tx) => {
        const c = await tx.kycCase.create({
          data: { userId: context.userId, status: 'IN_PROGRESS', level: 1 },
        });
        await tx.user.update({
          where: { id: context.userId },
          data: { kycStatus: 'IN_PROGRESS' },
        });
        return c;
      });
      kycCase = { ...newCase, documents: [] };
    }

    // Remplacer un document du même type s'il existe déjà
    const previous = await prisma.kycDocument.findMany({
      where: { kycCaseId: kycCase.id, type }, select: { storageKey: true },
    });
    await prisma.kycDocument.deleteMany({ where: { kycCaseId: kycCase.id, type } });
    void removeKycDocuments(previous.map((d) => d.storageKey));

    const useStorage = kycStorageEnabled();
    const doc = await prisma.kycDocument.create({
      data: {
        kycCaseId: kycCase.id, type, status: 'PENDING',
        fileUrl: useStorage ? '' : dataUrl,
      },
    });

    if (useStorage) {
      const stored = await storeKycDocument(context.userId, doc.id, dataUrl);
      if (stored) {
        await prisma.kycDocument.update({
          where: { id: doc.id },
          data: { storageKey: stored.storageKey, mimeType: stored.mimeType },
        });
      } else {
        // upload impossible → repli data-URI pour ne pas perdre la pièce
        await prisma.kycDocument.update({ where: { id: doc.id }, data: { fileUrl: dataUrl } });
      }
    }

    // Réévaluer : si une pièce d'identité + un selfie sont présents → passage en revue
    const docs = await prisma.kycDocument.findMany({ where: { kycCaseId: kycCase.id } });
    const hasId = docs.some((d) => ID_DOCS.includes(d.type));
    const hasSelfie = docs.some((d) => d.type === 'SELFIE');

    if (hasId && hasSelfie && kycCase.status !== 'UNDER_REVIEW') {
      await prisma.$transaction([
        prisma.kycCase.update({
          where: { id: kycCase.id },
          data: { status: 'UNDER_REVIEW', submittedAt: new Date() },
        }),
        prisma.user.update({
          where: { id: context.userId },
          data: { kycStatus: 'UNDER_REVIEW' },
        }),
      ]);
    }

    void recordAudit({
      userId: context.userId,
      action: 'kyc.submit_document',
      entity: 'KycDocument',
      entityId: doc.id,
      // ⚠️ ne jamais journaliser le contenu du document (dataUrl)
      metadata: { kycCaseId: kycCase.id, type: doc.type },
      request,
    });

    return created(
      { documentId: doc.id, type: doc.type, status: doc.status },
      'Document reçu. Il sera vérifié par notre équipe.'
    );
  } catch (e) {
    logApiError('/v1/kyc/documents', e);
    return serverError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    if (!type) return badRequest('Type de document requis.');

    const kycCase = await activeCaseFor(context.userId);
    if (!kycCase) return notFound('Aucun dossier KYC en cours.');

    const removed = await prisma.kycDocument.findMany({
      where: { kycCaseId: kycCase.id, type: type as never }, select: { storageKey: true },
    });
    await prisma.kycDocument.deleteMany({ where: { kycCaseId: kycCase.id, type: type as never } });
    void removeKycDocuments(removed.map((d) => d.storageKey));
    return ok(null, 'Document retiré.');
  } catch (e) {
    logApiError('/v1/kyc/documents', e);
    return serverError();
  }
}
