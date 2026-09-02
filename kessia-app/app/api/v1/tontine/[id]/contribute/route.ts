// ============================================================
// KESSIA — POST /api/v1/tontine/[id]/contribute
// Effectuer une cotisation à une tontine
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, badRequest, notFound, forbidden, conflict, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { recordAudit } from '@/lib/audit/audit.service';
import { notify } from '@/lib/notifications/notify';
import { checkAndAdvanceRound } from '@/lib/tontine/orchestrator';
import { settleContribution } from '@/lib/tontine/contributions';
import { recordTontineEvent } from '@/lib/tontine/events';

const contributeSchema = z.object({
  round: z.number().int().positive(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const body = await request.json();
    const parsed = contributeSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { round } = parsed.data;

    // Récupérer la tontine
    const tontine = await prisma.tontine.findUnique({
      where: { id: params.id },
    });

    if (!tontine) return notFound('Tontine introuvable.');
    if (tontine.status !== 'ACTIVE') return badRequest('Cette tontine n\'est pas active.');

    // Vérifier que l'utilisateur est membre actif
    const member = await prisma.tontineMember.findFirst({
      where: { tontineId: params.id, userId: context.userId, status: 'ACTIVE' },
    });

    if (!member) return forbidden('Vous n\'êtes pas membre actif de cette tontine.');

    // Vérifier qu'il n'a pas déjà cotisé pour ce round
    const existingContribution = await prisma.tontineContribution.findFirst({
      where: { memberId: member.id, round, status: { in: ['PAID'] } },
    });

    if (existingContribution) {
      return conflict('Vous avez déjà cotisé pour ce tour.');
    }

    // Récupérer le wallet du membre
    const wallet = await prisma.wallet.findUnique({
      where: { userId: context.userId },
    });

    if (!wallet) return notFound('Wallet introuvable.');
    if (wallet.isLocked) return badRequest('Votre wallet est verrouillé.');

    const amount = Number(tontine.amount);
    if (Number(wallet.balance) < amount) {
      return badRequest(`Solde insuffisant. Cotisation requise : ${amount.toLocaleString('fr-FR')} XOF.`);
    }

    // Débit du membre → crédit du séquestre de la tontine, atomique.
    // L'argent est réellement DÉTENU par le compte séquestre jusqu'au
    // versement au bénéficiaire (§6.5). Idempotent sur (membre, tour).
    const idemHeader = request.headers.get('idempotency-key')?.trim().slice(0, 60) || null;
    const settled = await settleContribution({
      tontineId: params.id,
      memberId: member.id,
      payerUserId: context.userId,
      round,
      amount,
      tontineName: tontine.name,
      currency: tontine.currency,
      idempotencySuffix: idemHeader,
    });

    if (!settled.ok || !settled.contributionId) {
      return badRequest(settled.error ?? 'Erreur lors de la cotisation.');
    }

    const contribution = { id: settled.contributionId };
    const balanceAfter = settled.balanceAfter;

    void recordAudit({
      userId: context.userId,
      action: 'tontine.contribute',
      entity: 'TontineContribution',
      entityId: contribution.id,
      metadata: { tontineId: params.id, round, amount, balanceAfter, escrowBalanceAfter: settled.escrowBalanceAfter },
      request,
    });
    void recordTontineEvent({
      tontineId: params.id, type: 'CONTRIBUTION_PAID', actorId: context.userId, round, amount,
    });

    // Notifier le gestionnaire de la tontine (sauf si c'est lui qui cotise)
    if (tontine.createdById !== context.userId) {
      const contributor = await prisma.user.findUnique({
        where: { id: context.userId },
        select: { firstName: true, lastName: true },
      });
      void notify({
        userId: tontine.createdById,
        category: 'TONTINE',
        priority: 'NORMAL',
        title: 'Cotisation reçue',
        body: `${contributor?.firstName ?? 'Un membre'} ${contributor?.lastName ?? ''} a cotisé ${amount.toLocaleString('fr-FR')} XOF pour le tour ${round} de « ${tontine.name} ».`,
        actionUrl: `/tontine/${params.id}`,
      });
    }

    // Le tour est-il complet ? → versement au bénéficiaire + passage au tour suivant
    let roundResult;
    try {
      roundResult = await checkAndAdvanceRound(params.id);
    } catch (e) {
      logApiError('/v1/tontine/[id]/contribute:advance', e);
    }

    return ok(
      {
        contributionId: contribution.id,
        amount,
        round,
        balanceAfter,
        escrowHeld: settled.escrowBalanceAfter,
        roundAdvanced: roundResult?.status === 'ACTIVE' && roundResult.currentRound !== round,
        tontineStatus: roundResult?.status,
      },
      `Cotisation de ${amount.toLocaleString('fr-FR')} XOF pour le tour ${round} effectuée avec succès.`
    );
  } catch (error) {
    logApiError('/v1/tontine/[id]/contribute', error);
    return serverError();
  }
}
