// ============================================================
// KESSIA — GET/POST /api/v1/tontine
// Liste des tontines + Créer une nouvelle tontine
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { generateInviteCode } from '@/lib/utils/crypto';
import { ok, created, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { recordAudit } from '@/lib/audit/audit.service';
import { TONTINE_TYPE_KEYS, totalRoundsForType, resolveDistribution, soloContributionAmount } from '@/lib/tontine/type-meta';
import { recordTontineEvent } from '@/lib/tontine/events';
import { elevateRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

const createTontineSchema = z
  .object({
    name: z.string().min(3, 'Nom trop court').max(100, 'Nom trop long'),
    description: z.string().max(500).optional(),
    type: z.enum(TONTINE_TYPE_KEYS).default('CLASSIC_ROTATING'),
    // Achat : GROUP (cagnotte tournante) ou SOLO (achat individuel).
    purchaseMode: z.enum(['GROUP', 'SOLO']).default('GROUP'),
    /** Achat solo : libellé de l'article visé. */
    purchaseItem: z.string().min(2).max(120).optional(),
    /** Achat solo : prix cible de l'article. */
    targetAmount: z.number().positive().max(50_000_000).optional(),
    /** Achat solo : nombre de versements. */
    plannedRounds: z.number().int().min(2).max(60).optional(),
    amount: z.number().positive().max(1_000_000, 'Montant de cotisation trop élevé'),
    frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('MONTHLY'),
    startDate: z.string().datetime({ message: 'Date de début invalide' }),
    maxMembers: z.number().int().min(1).max(50),
    rules: z.string().max(1000).optional(),
    isPublic: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const solo = v.type === 'PURCHASE' && v.purchaseMode === 'SOLO';
    if (solo) {
      if (!v.targetAmount) ctx.addIssue({ code: 'custom', path: ['targetAmount'], message: 'Prix de l’article requis.' });
      if (!v.plannedRounds) ctx.addIssue({ code: 'custom', path: ['plannedRounds'], message: 'Nombre de versements requis.' });
      if (!v.purchaseItem) ctx.addIssue({ code: 'custom', path: ['purchaseItem'], message: 'Nom de l’article requis.' });
    } else {
      if (v.maxMembers < 2) {
        ctx.addIssue({ code: 'custom', path: ['maxMembers'], message: 'Une tontine de groupe compte au moins 2 membres.' });
      }
      if (v.purchaseMode === 'SOLO') {
        ctx.addIssue({ code: 'custom', path: ['purchaseMode'], message: 'Le mode individuel est réservé à la tontine Achat.' });
      }
    }
  });

// ---- GET : Liste des tontines de l'utilisateur ----

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const tontines = await prisma.tontine.findMany({
      where: {
        members: { some: { userId: context.userId, status: 'ACTIVE' } },
        ...(status ? { status: status as never } : {}),
      },
      include: {
        _count: { select: { members: { where: { status: 'ACTIVE' } } } },
        members: {
          where: { userId: context.userId },
          select: {
            id: true,
            orderPosition: true,
            totalContributed: true,
            totalReceived: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = tontines.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      type: t.type,
      purchaseMode: t.purchaseMode,
      purchaseItem: t.purchaseItem,
      targetAmount: t.targetAmount != null ? Number(t.targetAmount) : null,
      amount: Number(t.amount),
      currency: t.currency,
      frequency: t.frequency,
      startDate: t.startDate,
      maxMembers: t.maxMembers,
      status: t.status,
      inviteCode: t.inviteCode,
      isPublic: t.isPublic,
      currentRound: t.currentRound,
      totalRounds: t.totalRounds,
      nextContributionDate: t.nextContributionDate,
      memberCount: t._count.members,
      myMembership: t.members[0] ?? null,
      isCreator: t.createdById === context.userId,
      createdAt: t.createdAt,
    }));

    return ok(formatted);
  } catch (error) {
    logApiError('/v1/tontine', error);
    return serverError();
  }
}

// ---- POST : Créer une tontine ----

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const body = await request.json();
    const parsed = createTontineSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const data = parsed.data;
    const isSolo = resolveDistribution(data.type, data.purchaseMode) === 'solo';

    // Achat individuel : l'acheteur est seul membre, le montant par
    // versement est dérivé du prix cible / nombre de versements, et
    // l'argent est bloqué en séquestre jusqu'au dernier versement.
    const purchaseMode = isSolo ? 'SOLO' : 'GROUP';
    const purchaseItem = isSolo ? data.purchaseItem! : undefined;
    const targetAmount = isSolo ? data.targetAmount! : undefined;
    const maxMembers = isSolo ? 1 : data.maxMembers;
    const isPublic = isSolo ? false : data.isPublic;
    const amount = isSolo
      ? soloContributionAmount(data.targetAmount!, data.plannedRounds!)
      : data.amount;
    const totalRounds = isSolo
      ? data.plannedRounds!
      : totalRoundsForType(data.type, data.maxMembers);

    // Générer un code d'invitation unique
    let inviteCode = generateInviteCode();
    let attempts = 0;
    while (attempts < 5) {
      const exists = await prisma.tontine.findUnique({ where: { inviteCode } });
      if (!exists) break;
      inviteCode = generateInviteCode();
      attempts++;
    }

    const tontine = await prisma.$transaction(async (tx) => {
      const newTontine = await tx.tontine.create({
        data: {
          name: data.name,
          description: data.description,
          type: data.type,
          purchaseMode,
          purchaseItem,
          targetAmount,
          amount,
          frequency: data.frequency,
          startDate: new Date(data.startDate),
          maxMembers,
          rules: data.rules,
          isPublic,
          inviteCode,
          totalRounds,
          createdById: context.userId,
        },
      });

      // Le créateur devient automatiquement membre (et accepte les règles)
      await tx.tontineMember.create({
        data: {
          tontineId: newTontine.id,
          userId: context.userId,
          orderPosition: 1,
          agreementAcceptedAt: new Date(),
        },
      });

      return newTontine;
    });

    void recordAudit({
      userId: context.userId,
      action: 'tontine.create',
      entity: 'Tontine',
      entityId: tontine.id,
      metadata: { name: tontine.name, type: data.type, purchaseMode, amount, maxMembers, totalRounds, frequency: data.frequency },
      request,
    });
    void recordTontineEvent({
      tontineId: tontine.id, type: 'CREATED', actorId: context.userId,
      metadata: { name: tontine.name, type: data.type, purchaseMode },
    });
    // Élévation de rôle : premier gestionnaire de tontine (§4)
    void elevateRole(context.userId, 'TONTINE_MANAGER');

    return created(
      {
        id: tontine.id,
        name: tontine.name,
        type: tontine.type,
        purchaseMode: tontine.purchaseMode,
        inviteCode: tontine.inviteCode,
        status: tontine.status,
      },
      isSolo
        ? `Plan d'achat individuel « ${tontine.name} » créé : ${totalRounds} versement(s) de ${amount.toLocaleString('fr-FR')} FCFA. Démarrez-le quand vous voulez.`
        : `Tontine "${tontine.name}" créée avec succès. Partagez le code: ${inviteCode}`
    );
  } catch (error) {
    logApiError('/v1/tontine', error);
    return serverError();
  }
}
