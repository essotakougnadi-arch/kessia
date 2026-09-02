// ============================================================
// KESSIA — GET/POST /api/v1/legal/acceptance (§8)
// État et enregistrement de l'acceptation de la version courante
// des documents juridiques par l'utilisateur connecté.
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { LEGAL_VERSION, LEGAL_VERSION_LABEL, LEGAL_DOCS, isTermsUpToDate } from '@/lib/legal/versions';
import { ok, notFound, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { recordAudit } from '@/lib/audit/audit.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: { termsAcceptedVersion: true, termsAcceptedAt: true },
    });
    if (!user) return notFound('Utilisateur introuvable.');

    return ok({
      acceptedVersion: user.termsAcceptedVersion ?? null,
      acceptedAt: user.termsAcceptedAt ?? null,
      currentVersion: LEGAL_VERSION,
      currentVersionLabel: LEGAL_VERSION_LABEL,
      upToDate: isTermsUpToDate(user.termsAcceptedVersion),
      documents: Object.values(LEGAL_DOCS),
    });
  } catch (e) {
    logApiError('/v1/legal/acceptance', e);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const now = new Date();
    await prisma.user.update({
      where: { id: context.userId },
      data: { termsAcceptedVersion: LEGAL_VERSION, termsAcceptedAt: now },
    });

    void recordAudit({
      userId: context.userId,
      action: 'legal.terms_accepted',
      entity: 'User',
      entityId: context.userId,
      metadata: { termsVersion: LEGAL_VERSION, context: 'reacceptance' },
      request,
    });

    return ok(
      { acceptedVersion: LEGAL_VERSION, acceptedAt: now, upToDate: true },
      'Merci, votre acceptation a été enregistrée.'
    );
  } catch (e) {
    logApiError('/v1/legal/acceptance', e);
    return serverError();
  }
}
