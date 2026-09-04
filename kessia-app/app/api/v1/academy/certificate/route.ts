// ============================================================
// KESSIA — GET /api/v1/academy/certificate?course=<id>  (§10, ADR 0041)
// Certificat de démonstration (PDF), généré à la volée à partir du
// catalogue statique + du nom du membre. Rien n'est persisté : la
// progression de cours reste un état 100 % client (voir academy-client.tsx).
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { COURSES } from '@/lib/modules/academy-data';
import { renderCertificatePdf, certificateFileName } from '@/lib/modules/academy-certificate';
import { badRequest, notFound, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const courseId = request.nextUrl.searchParams.get('course');
    if (!courseId) return badRequest('Cours manquant.');

    const course = COURSES.find((c) => c.id === courseId);
    if (!course) return notFound('Cours introuvable.');

    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: { firstName: true, lastName: true },
    });
    if (!user) return notFound('Membre introuvable.');

    const pdf = renderCertificatePdf(course, { name: `${user.firstName} ${user.lastName}` });
    return new Response(pdf as BodyInit, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${certificateFileName(course)}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (e) {
    logApiError('/v1/academy/certificate', e);
    return serverError();
  }
}
