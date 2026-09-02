// ============================================================
// KESSIA — GET/POST /api/v1/tontine/[id]/members
// Membres d'une tontine + Rejoindre via code d'invitation
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, created, notFound, conflict, forbidden, badRequest, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { activateTontine } from '@/lib/tontine/orchestrator';
import { recordTontineEvent } from '@/lib/tontine/events';

export const dynamic = 'force-dynamic';

const joinSchema = z.object({
  inviteCode: z.string().min(4, 'Code d\'invitation invalide'),
});

// ---- GET : Liste des membres ----

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const tontine = await prisma.tontine.findUnique({
      where: { id: params.id },
      select: { id: true, isPublic: true },
    });

    if (!tontine) return notFound('Tontine introuvable.');

    const isMember = await prisma.tontineMember.findFirst({
      where: { tontineId: params.id, userId: context.userId, status: 'ACTIVE' },
    });

    if (!isMember && !tontine.isPublic) {
      return forbidden('Accès réservé aux membres.');
    }

    const members = await prisma.tontineMember.findMany({
      where: { tontineId: params.id },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
      orderBy: [{ orderPosition: 'asc' }, { joinedAt: 'asc' }],
    });

    return ok(
      members.map((m) => ({
        ...m,
        totalContributed: Number(m.totalContributed),
        totalReceived: Number(m.totalReceived),
      }))
    );
  } catch (error) {
    logApiError('/v1/tontine/[id]/members', error);
    return serverError();
  }
}

// ---- POST : Rejoindre une tontine ----

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const body = await request.json();
    const parsed = joinSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { inviteCode } = parsed.data;

    const tontine = await prisma.tontine.findFirst({
      where: { id: params.id, inviteCode },
      include: {
        _count: { select: { members: { where: { status: 'ACTIVE' } } } },
      },
    });

    if (!tontine) {
      return notFound('Code d\'invitation invalide ou tontine introuvable.');
    }

    if (tontine.status !== 'PENDING') {
      return badRequest('Cette tontine a déjà démarré et n\'accepte plus de nouveaux membres.');
    }

    if (tontine._count.members >= tontine.maxMembers) {
      return badRequest('Cette tontine est complète. Elle n\'accepte plus de membres.');
    }

    // Vérifier que l'utilisateur n'est pas déjà membre
    const existingMember = await prisma.tontineMember.findFirst({
      where: { tontineId: params.id, userId: context.userId },
    });

    if (existingMember) {
      if (existingMember.status === 'ACTIVE') {
        return conflict('Vous êtes déjà membre de cette tontine.');
      }
      if (existingMember.status === 'SUSPENDED' || existingMember.status === 'REMOVED') {
        return forbidden('Vous avez été retiré de cette tontine et ne pouvez pas la rejoindre à nouveau.');
      }
    }

    // Rejoindre
    const nextPosition = tontine._count.members + 1;
    const member = await prisma.tontineMember.create({
      data: {
        tontineId: params.id,
        userId: context.userId,
        orderPosition: nextPosition,
        agreementAcceptedAt: new Date(),
      },
    });
    void recordTontineEvent({
      tontineId: params.id, type: 'MEMBER_JOINED', actorId: context.userId,
      metadata: { position: nextPosition, via: 'invite' },
    });

    let started = false;
    if (nextPosition >= tontine.maxMembers) {
      const r = await activateTontine(params.id).catch(() => null);
      started = r?.ok ?? false;
    }

    return created(
      {
        memberId: member.id,
        tontineId: params.id,
        orderPosition: nextPosition,
        started,
      },
      started
        ? `Vous avez rejoint "${tontine.name}" — complète, la tontine a démarré !`
        : `Vous avez rejoint la tontine "${tontine.name}" avec succès !`
    );
  } catch (error) {
    logApiError('/v1/tontine/[id]/members', error);
    return serverError();
  }
}
