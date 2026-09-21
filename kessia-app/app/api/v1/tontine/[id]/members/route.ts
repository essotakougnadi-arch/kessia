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

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const body = await request.json();
    const parsed = joinSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { inviteCode } = parsed.data;

    // Vérifier que l'utilisateur n'est pas déjà membre (lecture rapide,
    // hors verrou — le cas de double-requête concurrente du MÊME
    // utilisateur reste couvert en dernier recours par la contrainte
    // `@@unique([tontineId, userId])`, hors périmètre P1.7).
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

    // Verrou (P1.7) : capacité (`maxMembers`) et position d'adhésion
    // revérifiées À L'INTÉRIEUR du verrou de ligne — deux adhésions
    // concurrentes ne peuvent plus toutes deux lire le même compte de
    // membres avant qu'aucune ne s'écrive (dépassement de capacité /
    // collision de position). Même schéma que `activateTontine`.
    const joinResult = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tontines WHERE id = ${params.id} FOR UPDATE`;

      const tontine = await tx.tontine.findUnique({
        where: { id: params.id },
        include: { _count: { select: { members: { where: { status: 'ACTIVE' } } } } },
      });
      if (!tontine || tontine.inviteCode !== inviteCode) {
        return { ok: false as const, code: 'NOT_FOUND' as const };
      }
      if (tontine.status !== 'PENDING') {
        return { ok: false as const, code: 'STARTED' as const };
      }
      if (tontine._count.members >= tontine.maxMembers) {
        return { ok: false as const, code: 'FULL' as const };
      }

      const nextPosition = tontine._count.members + 1;
      const member = await tx.tontineMember.create({
        data: {
          tontineId: params.id,
          userId: context.userId,
          orderPosition: nextPosition,
          agreementAcceptedAt: new Date(),
        },
      });
      return {
        ok: true as const, member, nextPosition,
        maxMembers: tontine.maxMembers, tontineName: tontine.name,
      };
    }, { timeout: 15_000, maxWait: 8_000 });

    if (!joinResult.ok) {
      if (joinResult.code === 'NOT_FOUND') return notFound('Code d\'invitation invalide ou tontine introuvable.');
      if (joinResult.code === 'STARTED') return badRequest('Cette tontine a déjà démarré et n\'accepte plus de nouveaux membres.');
      return badRequest('Cette tontine est complète. Elle n\'accepte plus de membres.');
    }

    const { member, nextPosition, maxMembers, tontineName } = joinResult;

    void recordTontineEvent({
      tontineId: params.id, type: 'MEMBER_JOINED', actorId: context.userId,
      metadata: { position: nextPosition, via: 'invite' },
    });

    let started = false;
    if (nextPosition >= maxMembers) {
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
        ? `Vous avez rejoint "${tontineName}" — complète, la tontine a démarré !`
        : `Vous avez rejoint la tontine "${tontineName}" avec succès !`
    );
  } catch (error) {
    logApiError('/v1/tontine/[id]/members', error);
    return serverError();
  }
}
