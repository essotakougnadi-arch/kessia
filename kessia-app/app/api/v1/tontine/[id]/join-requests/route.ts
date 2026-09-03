// ============================================================
// KESSIA — GET/POST /api/v1/tontine/[id]/join-requests
// Demandes d'adhésion à une tontine publique (§6, découverte).
//  GET  : liste des demandes (gestionnaire uniquement)
//  POST : le candidat envoie (ou renvoie) une demande
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, created, notFound, forbidden, badRequest, conflict, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { notify } from '@/lib/notifications/notify';
import { describeJoinability } from '@/lib/tontine/join';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  message: z.string().trim().max(500).optional(),
});

// ---- GET : liste des demandes (gestionnaire) ----

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const tontine = await prisma.tontine.findUnique({
      where: { id: params.id },
      select: { id: true, createdById: true },
    });
    if (!tontine) return notFound('Tontine introuvable.');
    if (tontine.createdById !== context.userId) {
      return forbidden('Seul le gestionnaire de la tontine peut consulter les demandes.');
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const requests = await prisma.tontineJoinRequest.findMany({
      where: {
        tontineId: params.id,
        ...(status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED' || status === 'CANCELLED'
          ? { status }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, phone: true, kycStatus: true,
            profile: { select: { city: true, country: true } },
          },
        },
      },
    });

    return ok(
      requests.map((r) => ({
        id: r.id,
        status: r.status,
        message: r.message,
        decisionNote: r.decisionNote,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
        user: {
          id: r.user.id,
          name: `${r.user.firstName} ${r.user.lastName}`,
          phone: r.user.phone,
          kycStatus: r.user.kycStatus,
          city: r.user.profile?.city ?? null,
          country: r.user.profile?.country ?? null,
        },
      }))
    );
  } catch (error) {
    logApiError('/v1/tontine/[id]/join-requests', error);
    return serverError();
  }
}

// ---- POST : envoyer une demande d'adhésion ----

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'tontine.join-request', {
      limit: 10, windowMs: 60 * 60_000, by: context.userId,
    });
    if (limited) return limited;

    const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);

    const tontine = await prisma.tontine.findUnique({
      where: { id: params.id },
      select: {
        id: true, name: true, isPublic: true, status: true, maxMembers: true,
        createdById: true, membershipConditions: true,
        _count: { select: { members: { where: { status: 'ACTIVE' } } } },
      },
    });
    if (!tontine) return notFound('Tontine introuvable.');

    const [member, existing] = await Promise.all([
      prisma.tontineMember.findUnique({
        where: { tontineId_userId: { tontineId: params.id, userId: context.userId } },
        select: { status: true },
      }),
      prisma.tontineJoinRequest.findUnique({
        where: { tontineId_userId: { tontineId: params.id, userId: context.userId } },
        select: { id: true, status: true },
      }),
    ]);

    const joinability = describeJoinability({
      isPublic: tontine.isPublic,
      status: tontine.status,
      memberCount: tontine._count.members,
      maxMembers: tontine.maxMembers,
      isCreator: tontine.createdById === context.userId,
      memberStatus: member?.status ?? null,
      requestStatus: existing?.status ?? null,
    });

    if (!joinability.canRequest) {
      const msg: Record<string, string> = {
        IS_CREATOR: 'Vous gérez déjà cette tontine.',
        ALREADY_MEMBER: 'Vous êtes déjà membre de cette tontine.',
        REQUEST_PENDING: 'Votre demande est déjà en attente de validation.',
        REQUEST_APPROVED: 'Votre demande a déjà été acceptée.',
        REMOVED: 'Vous ne pouvez pas rejoindre cette tontine.',
        NOT_PUBLIC: 'Cette tontine n\'accepte pas les demandes publiques.',
        NOT_OPEN: 'Cette tontine a déjà démarré.',
        FULL: 'Cette tontine est complète.',
      };
      return conflict(msg[joinability.code] ?? 'Demande impossible.');
    }

    const jr = await prisma.tontineJoinRequest.upsert({
      where: { tontineId_userId: { tontineId: params.id, userId: context.userId } },
      create: {
        tontineId: params.id,
        userId: context.userId,
        message: parsed.data.message || null,
        status: 'PENDING',
      },
      update: {
        status: 'PENDING',
        message: parsed.data.message || null,
        decisionNote: null,
        decidedById: null,
        decidedAt: null,
      },
    });

    const applicant = await prisma.user.findUnique({
      where: { id: context.userId },
      select: { firstName: true, lastName: true },
    });
    void notify({
      userId: tontine.createdById,
      category: 'TONTINE',
      priority: 'HIGH',
      title: 'Nouvelle demande d\'adhésion',
      body: `${applicant?.firstName ?? 'Un utilisateur'} ${applicant?.lastName ?? ''} souhaite rejoindre « ${tontine.name} ».`,
      actionUrl: `/tontine/${params.id}`,
    });

    return created(
      { requestId: jr.id, status: jr.status },
      'Votre demande a été envoyée au gestionnaire de la tontine.'
    );
  } catch (error) {
    logApiError('/v1/tontine/[id]/join-requests', error);
    return serverError();
  }
}
