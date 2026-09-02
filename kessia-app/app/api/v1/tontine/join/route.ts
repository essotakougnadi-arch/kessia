// ============================================================
// KESSIA — POST /api/v1/tontine/join
// Rejoindre une tontine à partir du seul code d'invitation
// (cahier des charges §7, §12). Complète /tontine/[id]/members
// qui exige déjà de connaître l'id.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { recordAudit } from '@/lib/audit/audit.service';
import { notify } from '@/lib/notifications/notify';
import { activateTontine } from '@/lib/tontine/orchestrator';
import { recordTontineEvent } from '@/lib/tontine/events';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { ok, created, badRequest, notFound, conflict, forbidden, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const schema = z.object({
  code: z.string().min(4, "Code d'invitation invalide").max(32),
});

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'tontine.join', { limit: 10, windowMs: 60_000, by: context.userId });
    if (limited) return limited;

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const code = parsed.data.code.trim().toUpperCase();

    const tontine = await prisma.tontine.findFirst({
      where: { inviteCode: code },
      include: { _count: { select: { members: { where: { status: 'ACTIVE' } } } } },
    });
    if (!tontine) return notFound("Aucune tontine ne correspond à ce code.");

    if (tontine.type === 'PURCHASE' && tontine.purchaseMode === 'SOLO') {
      return badRequest("C'est un plan d'achat individuel — il ne se rejoint pas.");
    }
    if (tontine.status !== 'PENDING') {
      return badRequest("Cette tontine a déjà démarré et n'accepte plus de nouveaux membres.");
    }
    if (tontine._count.members >= tontine.maxMembers) {
      return badRequest("Cette tontine est complète.");
    }

    const existing = await prisma.tontineMember.findFirst({
      where: { tontineId: tontine.id, userId: context.userId },
    });
    if (existing) {
      if (existing.status === 'ACTIVE') {
        // Renvoyer 200 avec l'id pour permettre au client de naviguer
        return ok({ tontineId: tontine.id, memberId: existing.id, alreadyMember: true }, 'Vous êtes déjà membre de cette tontine.');
      }
      if (existing.status === 'SUSPENDED' || existing.status === 'REMOVED') {
        return forbidden("Vous avez été retiré de cette tontine et ne pouvez pas la rejoindre à nouveau.");
      }
      return conflict('Adhésion déjà en cours de traitement.');
    }

    const nextPosition = tontine._count.members + 1;
    const member = await prisma.tontineMember.create({
      data: {
        tontineId: tontine.id,
        userId: context.userId,
        orderPosition: nextPosition,
        agreementAcceptedAt: new Date(), // rejoindre = accepter les règles (tracé)
      },
    });
    void recordTontineEvent({
      tontineId: tontine.id, type: 'MEMBER_JOINED', actorId: context.userId,
      metadata: { position: nextPosition, via: 'code' },
    });

    // Tontine complète → démarrage automatique
    let started = false;
    if (nextPosition >= tontine.maxMembers) {
      const r = await activateTontine(tontine.id).catch(() => null);
      started = r?.ok ?? false;
    }

    void recordAudit({
      userId: context.userId,
      action: 'tontine.join',
      entity: 'TontineMember',
      entityId: member.id,
      metadata: { tontineId: tontine.id, via: 'code' },
      request,
    });

    const joiner = await prisma.user.findUnique({
      where: { id: context.userId },
      select: { firstName: true, lastName: true },
    });
    void notify({
      userId: tontine.createdById,
      category: 'TONTINE',
      priority: 'NORMAL',
      title: 'Nouveau membre',
      body: `${joiner?.firstName ?? 'Un membre'} ${joiner?.lastName ?? ''} a rejoint votre tontine « ${tontine.name} » (${nextPosition}/${tontine.maxMembers}).`,
      actionUrl: `/tontine/${tontine.id}`,
    });

    return created(
      { tontineId: tontine.id, memberId: member.id, orderPosition: nextPosition, name: tontine.name, started },
      started
        ? `Vous avez rejoint « ${tontine.name} » — la tontine est complète et vient de démarrer !`
        : `Vous avez rejoint la tontine « ${tontine.name} » !`
    );
  } catch (e) {
    logApiError('/v1/tontine/join', e);
    return serverError();
  }
}
