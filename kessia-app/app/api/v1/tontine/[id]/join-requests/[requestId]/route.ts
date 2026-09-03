// ============================================================
// KESSIA — PATCH /api/v1/tontine/[id]/join-requests/[requestId]
//  gestionnaire : { action: 'approve' | 'reject', note? }
//  candidat     : { action: 'cancel' }
// L'acceptation crée le membre (et démarre la tontine si complète).
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, notFound, forbidden, badRequest, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { recordTontineEvent } from '@/lib/tontine/events';
import { activateTontine } from '@/lib/tontine/orchestrator';
import { notify } from '@/lib/notifications/notify';
import { recordAudit } from '@/lib/audit/audit.service';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  action: z.enum(['approve', 'reject', 'cancel']),
  note: z.string().trim().max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; requestId: string } }
) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const { action, note } = parsed.data;

    // `me` = la demande du candidat courant (utilisé pour l'annulation).
    const jr = await prisma.tontineJoinRequest.findFirst({
      where:
        params.requestId === 'me'
          ? { tontineId: params.id, userId: context.userId }
          : { id: params.requestId, tontineId: params.id },
      include: {
        tontine: {
          select: {
            id: true, name: true, status: true, maxMembers: true, createdById: true,
            _count: { select: { members: { where: { status: 'ACTIVE' } } } },
          },
        },
      },
    });
    if (!jr) return notFound('Demande introuvable.');

    const isCreator = jr.tontine.createdById === context.userId;
    const isApplicant = jr.userId === context.userId;

    // ── Candidat : annulation ──
    if (action === 'cancel') {
      if (!isApplicant) return forbidden('Vous ne pouvez annuler que votre propre demande.');
      if (jr.status !== 'PENDING') return badRequest('Cette demande n\'est plus en attente.');
      await prisma.tontineJoinRequest.update({
        where: { id: jr.id },
        data: { status: 'CANCELLED', decidedAt: new Date() },
      });
      return ok({ status: 'CANCELLED' }, 'Demande annulée.');
    }

    // ── Gestionnaire : accepter / refuser ──
    if (!isCreator) return forbidden('Seul le gestionnaire de la tontine peut décider.');
    if (jr.status !== 'PENDING') return badRequest('Cette demande a déjà été traitée.');

    if (action === 'reject') {
      await prisma.tontineJoinRequest.update({
        where: { id: jr.id },
        data: { status: 'REJECTED', decisionNote: note || null, decidedById: context.userId, decidedAt: new Date() },
      });
      void notify({
        userId: jr.userId,
        category: 'TONTINE',
        title: 'Demande d\'adhésion refusée',
        body: note
          ? `Votre demande pour « ${jr.tontine.name} » n'a pas été retenue : ${note}`
          : `Votre demande pour « ${jr.tontine.name} » n'a pas été retenue.`,
        actionUrl: `/tontine/${params.id}`,
      });
      void recordAudit({
        userId: context.userId, action: 'tontine.join.reject', entity: 'TontineJoinRequest', entityId: jr.id, request,
      });
      return ok({ status: 'REJECTED' }, 'Demande refusée.');
    }

    // action === 'approve'
    if (jr.tontine.status !== 'PENDING') {
      return badRequest('La tontine a déjà démarré, impossible d\'ajouter un membre.');
    }
    if (jr.tontine._count.members >= jr.tontine.maxMembers) {
      return badRequest('La tontine est complète.');
    }

    const removed = await prisma.tontineMember.findUnique({
      where: { tontineId_userId: { tontineId: params.id, userId: jr.userId } },
      select: { status: true },
    });
    if (removed && (removed.status === 'SUSPENDED' || removed.status === 'REMOVED')) {
      return badRequest('Cet utilisateur a été retiré de la tontine.');
    }

    const nextPosition = jr.tontine._count.members + 1;

    await prisma.$transaction(async (tx) => {
      await tx.tontineJoinRequest.update({
        where: { id: jr.id },
        data: { status: 'APPROVED', decisionNote: note || null, decidedById: context.userId, decidedAt: new Date() },
      });
      await tx.tontineMember.upsert({
        where: { tontineId_userId: { tontineId: params.id, userId: jr.userId } },
        create: {
          tontineId: params.id,
          userId: jr.userId,
          status: 'ACTIVE',
          orderPosition: nextPosition,
          agreementAcceptedAt: new Date(),
        },
        update: { status: 'ACTIVE', orderPosition: nextPosition, agreementAcceptedAt: new Date() },
      });
    });

    void recordTontineEvent({
      tontineId: params.id, type: 'MEMBER_JOINED', actorId: jr.userId,
      metadata: { position: nextPosition, via: 'join-request', approvedBy: context.userId },
    });

    let started = false;
    if (nextPosition >= jr.tontine.maxMembers) {
      const r = await activateTontine(params.id).catch(() => null);
      started = r?.ok ?? false;
    }

    void notify({
      userId: jr.userId,
      category: 'TONTINE',
      priority: 'HIGH',
      title: 'Demande d\'adhésion acceptée 🎉',
      body: started
        ? `Vous avez rejoint « ${jr.tontine.name} » — complète, la tontine a démarré !`
        : `Vous avez rejoint la tontine « ${jr.tontine.name} ».`,
      actionUrl: `/tontine/${params.id}`,
    });
    void recordAudit({
      userId: context.userId, action: 'tontine.join.approve', entity: 'TontineJoinRequest', entityId: jr.id, request,
    });

    return ok({ status: 'APPROVED', memberPosition: nextPosition, started }, 'Membre ajouté à la tontine.');
  } catch (error) {
    logApiError('/v1/tontine/[id]/join-requests/[requestId]', error);
    return serverError();
  }
}
