// ============================================================
// KESSIA — GET/POST /api/v1/tontine/[id]/agreement
// Contrat numérique de la tontine · « Smart Agreement » (§6.4)
//   GET  → termes + acceptations + journal d'événements
//   POST { action: 'accept' } → acceptation explicite du membre
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { recordAudit } from '@/lib/audit/audit.service';
import { recordTontineEvent, tontineEventLabel } from '@/lib/tontine/events';
import { buildAgreementTerms } from '@/lib/tontine/agreement';
import { ok, badRequest, notFound, forbidden, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const tontine = await prisma.tontine.findUnique({
      where: { id: params.id },
      include: {
        members: {
          orderBy: [{ orderPosition: 'asc' }, { joinedAt: 'asc' }],
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        events: { orderBy: { createdAt: 'desc' }, take: 60 },
      },
    });
    if (!tontine) return notFound('Tontine introuvable.');

    const isMember = tontine.members.some((m) => m.userId === context.userId && m.status === 'ACTIVE');
    if (!isMember && !tontine.isPublic) return forbidden('Accès réservé aux membres.');

    // Contrat figé (activation) ou aperçu calculé (tontine encore en attente)
    const terms =
      tontine.agreementJson ??
      buildAgreementTerms(
        tontine,
        tontine.members
          .filter((m) => m.status === 'ACTIVE')
          .map((m) => ({ userId: m.userId, orderPosition: m.orderPosition, joinedAt: m.joinedAt, user: m.user })),
      );

    return ok({
      finalized: tontine.agreementGeneratedAt != null,
      generatedAt: tontine.agreementGeneratedAt,
      terms,
      acceptances: tontine.members
        .filter((m) => m.status === 'ACTIVE')
        .map((m) => ({
          userId: m.user.id,
          name: `${m.user.firstName} ${m.user.lastName}`,
          position: m.orderPosition,
          acceptedAt: m.agreementAcceptedAt,
        })),
      myAcceptance: tontine.members.find((m) => m.userId === context.userId)?.agreementAcceptedAt ?? null,
      events: tontine.events.map((e) => ({
        id: e.id,
        type: e.type,
        label: tontineEventLabel(e.type),
        round: e.round,
        amount: e.amount ? Number(e.amount) : null,
        at: e.createdAt,
      })),
    });
  } catch (e) {
    logApiError('/v1/tontine/[id]/agreement', e);
    return serverError();
  }
}

const bodySchema = z.object({ action: z.literal('accept') });

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const member = await prisma.tontineMember.findFirst({
      where: { tontineId: params.id, userId: context.userId, status: 'ACTIVE' },
    });
    if (!member) return forbidden("Vous n'êtes pas membre de cette tontine.");

    const tontine = await prisma.tontine.findUnique({
      where: { id: params.id },
      select: { agreementGeneratedAt: true, name: true },
    });
    if (!tontine?.agreementGeneratedAt) {
      return badRequest("Le contrat n'est pas encore figé — il le sera au démarrage de la tontine.");
    }

    await prisma.tontineMember.update({
      where: { id: member.id },
      data: { agreementAcceptedAt: new Date() },
    });

    void recordTontineEvent({ tontineId: params.id, type: 'AGREEMENT_ACCEPTED', actorId: context.userId });
    void recordAudit({
      userId: context.userId, action: 'tontine.agreement_accept',
      entity: 'Tontine', entityId: params.id, request,
    });

    return ok({ acceptedAt: new Date().toISOString() }, 'Contrat accepté.');
  } catch (e) {
    logApiError('/v1/tontine/[id]/agreement', e);
    return serverError();
  }
}
