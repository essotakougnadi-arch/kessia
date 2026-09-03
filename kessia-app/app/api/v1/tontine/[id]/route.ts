// ============================================================
// KESSIA — GET/PATCH /api/v1/tontine/[id]
// Détails d'une tontine + Modification
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { assertOwnership } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, notFound, forbidden, validationError, serverError, badRequest } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { recordAudit } from '@/lib/audit/audit.service';
import { activateTontine } from '@/lib/tontine/orchestrator';
import { reconcileTontineEscrow } from '@/lib/tontine/escrow';

export const dynamic = 'force-dynamic';

const updateTontineSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().max(500).optional(),
  rules: z.string().max(1000).optional(),
  isPublic: z.boolean().optional(),
  membershipConditions: z.string().max(1000).optional(),
  action: z.literal('start').optional(),
});

// ---- GET : Détails d'une tontine ----

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const tontine = await prisma.tontine.findUnique({
      where: { id: params.id },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        members: {
          where: { status: 'ACTIVE' },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, phone: true },
            },
          },
          orderBy: { orderPosition: 'asc' },
        },
        contributions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        schedules: {
          orderBy: { round: 'asc' },
        },
        _count: { select: { members: { where: { status: 'ACTIVE' } } } },
      },
    });

    if (!tontine) {
      return notFound('Tontine introuvable.');
    }

    // Vérifier que l'utilisateur est membre ou que la tontine est publique
    const isMember = tontine.members.some((m) => m.userId === context.userId);
    if (!isMember && !tontine.isPublic) {
      return forbidden('Accès réservé aux membres de cette tontine.');
    }

    // Séquestre (§6.5) — montant réellement détenu pour le groupe.
    const escrow =
      tontine.status === 'ACTIVE' || tontine.status === 'COMPLETED'
        ? await reconcileTontineEscrow(tontine.id)
        : null;

    const isCreator = tontine.createdById === context.userId;
    const [myJoinRequest, pendingJoinRequestCount] = await Promise.all([
      isMember
        ? null
        : prisma.tontineJoinRequest.findUnique({
            where: { tontineId_userId: { tontineId: tontine.id, userId: context.userId } },
            select: { status: true, decisionNote: true, createdAt: true },
          }),
      isCreator
        ? prisma.tontineJoinRequest.count({ where: { tontineId: tontine.id, status: 'PENDING' } })
        : 0,
    ]);

    return ok({
      ...tontine,
      amount: Number(tontine.amount),
      targetAmount: tontine.targetAmount != null ? Number(tontine.targetAmount) : null,
      memberCount: tontine._count.members,
      myJoinRequest,
      pendingJoinRequestCount,
      escrow: escrow
        ? { held: escrow.held, expectedHeld: escrow.expectedHeld, balanced: escrow.balanced }
        : null,
      members: tontine.members.map((m) => ({
        ...m,
        totalContributed: Number(m.totalContributed),
        totalReceived: Number(m.totalReceived),
      })),
      contributions: tontine.contributions.map((c) => ({
        ...c,
        amount: Number(c.amount),
      })),
      isMember,
      isCreator,
    });
  } catch (error) {
    logApiError('/v1/tontine/[id]', error);
    return serverError();
  }
}

// ---- PATCH : Modifier une tontine ----

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const tontine = await prisma.tontine.findUnique({
      where: { id: params.id },
      select: { id: true, createdById: true, status: true },
    });

    if (!tontine) return notFound('Tontine introuvable.');

    if (!assertOwnership(context, tontine.createdById)) {
      return forbidden('Seul le créateur peut modifier cette tontine.');
    }

    if (tontine.status === 'COMPLETED' || tontine.status === 'CANCELLED') {
      return badRequest('Cette tontine ne peut plus être modifiée.');
    }

    const body = await request.json();
    const parsed = updateTontineSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    // Démarrage manuel par le créateur (avant que la tontine soit complète)
    if (parsed.data.action === 'start') {
      if (tontine.status !== 'PENDING') {
        return badRequest('Cette tontine a déjà démarré ou est clôturée.');
      }
      const result = await activateTontine(params.id);
      if (!result.ok) return badRequest(result.message);
      void recordAudit({
        userId: context.userId, action: 'tontine.start', entity: 'Tontine', entityId: params.id, request,
      });
      return ok({ id: params.id, status: result.status, currentRound: result.currentRound }, result.message);
    }

    const { action: _action, ...fields } = parsed.data;
    void _action;

    const updated = await prisma.tontine.update({
      where: { id: params.id },
      data: fields,
    });

    return ok({ id: updated.id, name: updated.name }, 'Tontine mise à jour.');
  } catch (error) {
    logApiError('/v1/tontine/[id]', error);
    return serverError();
  }
}
