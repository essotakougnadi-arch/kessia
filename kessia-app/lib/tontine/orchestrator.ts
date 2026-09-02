// ============================================================
// KESSIA — Orchestration des tontines (cahier des charges §7, §12)
//
//   activateTontine()      PENDING → ACTIVE : positions, calendrier, tour 1
//   checkAndAdvanceRound() tour complet → versement au bénéficiaire + tour++
//   runTontineTick()       (cron) : cotisations en retard + relances
//
// Idempotent : chaque versement utilise la clé ledger stable
// `TPAYOUT-<tontineId>-<round>`. Rejouer une étape est sans effet.
// ============================================================

import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { postDoubleEntry } from '@/lib/ledger/ledger.service';
import { logApiError } from '@/lib/logger';
import { notify, notifyMany } from '@/lib/notifications/notify';
import { addFrequency, addFrequencyN } from './schedule';
import { tontineTypeMeta, totalRoundsForType, resolveDistribution } from './type-meta';
import { buildAgreementTerms } from './agreement';
import { getOrCreateEscrowWallet } from './escrow';
import { recordTontineEvent } from './events';

export { addFrequency } from './schedule';

const DAY = 86_400_000;

export type OrchestratorResult = {
  ok: boolean;
  message: string;
  status?: string;
  currentRound?: number;
};

// ------------------------------------------------------------
// Activation
// ------------------------------------------------------------
export async function activateTontine(tontineId: string): Promise<OrchestratorResult> {
  const tontine = await prisma.tontine.findUnique({
    where: { id: tontineId },
    include: {
      members: {
        where: { status: 'ACTIVE' },
        orderBy: { joinedAt: 'asc' },
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (!tontine) return { ok: false, message: 'Tontine introuvable.' };
  if (tontine.status !== 'PENDING') {
    return { ok: false, message: 'Cette tontine a déjà démarré ou est clôturée.' };
  }

  const distribution = resolveDistribution(tontine.type, tontine.purchaseMode);
  const isSolo = distribution === 'solo';

  if (isSolo) {
    if (tontine.members.length < 1) {
      return { ok: false, message: 'Aucun membre — impossible de démarrer.' };
    }
  } else if (tontine.members.length < 2) {
    return { ok: false, message: 'Il faut au moins 2 membres pour démarrer.' };
  }

  const members = tontine.members;
  const amount = Number(tontine.amount);
  const firstDue = new Date(Math.max(Date.now(), new Date(tontine.startDate).getTime()));
  const meta = tontineTypeMeta(tontine.type);
  // Achat solo : le nombre de versements est fixé à la création
  // (`totalRounds`), il ne dépend pas du nombre de membres.
  const totalRounds = isSolo
    ? Math.max(1, tontine.totalRounds)
    : totalRoundsForType(tontine.type, members.length);

  // Contrat numérique (§6.4) — snapshot figé à l'activation
  const positioned = members.map((m, i) => ({
    userId: m.userId,
    orderPosition: i + 1,
    joinedAt: m.joinedAt,
    user: m.user,
  }));
  const agreement = buildAgreementTerms(
    { ...tontine, totalRounds },
    positioned,
    firstDue
  );

  // Compte séquestre (§6.5) créé hors transaction : c'est un compte vide,
  // il n'a pas besoin d'être cohérent transactionnellement avec l'activation,
  // et `getOrCreateEscrowWallet` est idempotent (unicité `tontineId`).
  await getOrCreateEscrowWallet(tontineId, tontine.currency);

  await prisma.$transaction(async (tx) => {
    // 1. Attribuer / normaliser les positions (1..N) selon l'ordre d'adhésion
    for (let i = 0; i < members.length; i++) {
      if (members[i].orderPosition !== i + 1 || members[i].agreementAcceptedAt === null) {
        await tx.tontineMember.update({
          where: { id: members[i].id },
          data: {
            orderPosition: i + 1,
            // L'adhésion vaut acceptation des règles (tracée). Un membre
            // peut re-confirmer explicitement depuis le détail de la tontine.
            agreementAcceptedAt: members[i].agreementAcceptedAt ?? members[i].joinedAt,
          },
        });
      }
    }

    // 2. Calendrier des tours
    //    - rotating : le membre en position r reçoit au tour r
    //    - project  : 1 tour, versé à l'organisateur (position 1)
    //    - growth   : N tours, distribution par membre en fin de cycle
    //    - solo      : N versements, restitution à l'unique membre en fin
    for (let round = 1; round <= totalRounds; round++) {
      const dueDate = round === 1 ? firstDue : addFrequencyN(firstDue, tontine.frequency, round - 1);
      const recipientId =
        distribution === 'rotating'
          ? members[round - 1].userId
          : distribution === 'project'
            ? members[0].userId
            : null;
      await tx.tontineSchedule.upsert({
        where: { id: `${tontineId}-r${round}` },
        create: { id: `${tontineId}-r${round}`, tontineId, round, dueDate, recipientId },
        update: { dueDate, recipientId },
      });
    }

    // 3. Cotisations PENDING du tour 1
    await createRoundContributions(tx, tontineId, members, 1, amount, firstDue);

    // 4. Passage à ACTIVE + gel du contrat
    await tx.tontine.update({
      where: { id: tontineId },
      data: {
        status: 'ACTIVE',
        currentRound: 1,
        totalRounds,
        nextContributionDate: firstDue,
        agreementJson: agreement as unknown as Prisma.InputJsonValue,
        agreementGeneratedAt: new Date(),
      },
    });
  }, { timeout: 20_000, maxWait: 10_000 });

  void recordTontineEvent({
    tontineId,
    type: 'ACTIVATED',
    actorId: tontine.createdById,
    metadata: { totalRounds, memberCount: members.length, type: tontine.type },
  });

  void notifyMany(
    members.map((m) => m.userId),
    isSolo
      ? {
          category: 'TONTINE', priority: 'NORMAL',
          title: `Votre plan d’achat « ${tontine.name} » a démarré 🛒`,
          body: `${totalRounds} versement${totalRounds > 1 ? 's' : ''} de ${amount.toLocaleString('fr-FR')} ${cur(tontine.currency)}. Premier versement attendu le ${firstDue.toLocaleDateString('fr-FR')} ; l’argent est détenu en séquestre jusqu’au bout.`,
          actionUrl: `/tontine/${tontineId}`,
        }
      : {
          category: 'TONTINE', priority: 'NORMAL',
          title: `La tontine « ${tontine.name} » a démarré`,
          body: `${meta.label} · ${totalRounds} tour${totalRounds > 1 ? 's' : ''}. Première cotisation de ${amount.toLocaleString('fr-FR')} ${cur(tontine.currency)} attendue le ${firstDue.toLocaleDateString('fr-FR')}.`,
          actionUrl: `/tontine/${tontineId}`,
        }
  );

  return { ok: true, message: 'Tontine démarrée.', status: 'ACTIVE', currentRound: 1 };
}

async function createRoundContributions(
  tx: Prisma.TransactionClient,
  tontineId: string,
  members: { id: string }[],
  round: number,
  amount: number,
  dueDate: Date
) {
  const existing = await tx.tontineContribution.findMany({
    where: { tontineId, round },
    select: { memberId: true },
  });
  const have = new Set(existing.map((e) => e.memberId));
  const toCreate = members.filter((m) => !have.has(m.id));
  if (toCreate.length === 0) return;
  await tx.tontineContribution.createMany({
    data: toCreate.map((m) => ({
      tontineId, memberId: m.id, round, amount, status: 'PENDING' as const, dueDate,
    })),
  });
}

// ------------------------------------------------------------
// Avancement de tour
// ------------------------------------------------------------
export async function checkAndAdvanceRound(tontineId: string): Promise<OrchestratorResult> {
  const tontine = await prisma.tontine.findUnique({
    where: { id: tontineId },
    include: {
      members: { where: { status: 'ACTIVE' }, orderBy: { orderPosition: 'asc' } },
    },
  });
  if (!tontine || tontine.status !== 'ACTIVE') {
    return { ok: false, message: 'Tontine non active.' };
  }

  const distribution = resolveDistribution(tontine.type, tontine.purchaseMode);
  const isSolo = distribution === 'solo';
  const round = tontine.currentRound;
  const activeMembers = tontine.members;
  const amount = Number(tontine.amount);
  const pot = amount * activeMembers.length;
  const isLast = round >= tontine.totalRounds;
  const nextDue = addFrequency(new Date(tontine.nextContributionDate ?? new Date()), tontine.frequency);
  const cy = cur(tontine.currency);

  // Toutes les cotisations du tour sont-elles réglées ?
  const paid = await prisma.tontineContribution.count({
    where: { tontineId, round, status: 'PAID' },
  });
  if (paid < activeMembers.length) {
    return { ok: true, message: `Tour ${round} : ${paid}/${activeMembers.length} cotisations.`, currentRound: round };
  }

  // Garde-fou d'idempotence : ce tour a-t-il déjà été traité ?
  const roundSchedule = await prisma.tontineSchedule.findFirst({
    where: { tontineId, round }, select: { isPaid: true },
  });
  const alreadySettled =
    distribution !== 'growth' && distribution !== 'solo' && roundSchedule?.isPaid === true;

  let advanced = false;

  // Séquestre de la tontine — source de vérité de l'argent réellement
  // détenu. Un versement n'est JAMAIS émis pour un montant supérieur à
  // ce qui est en séquestre (§6.5).
  const escrow = await getOrCreateEscrowWallet(tontineId, tontine.currency);
  const held = Number(escrow.balance);

  const shortfall = (need: number, what: string): OrchestratorResult => {
    void recordTontineEvent({
      tontineId, type: 'ESCROW_SHORTFALL', round,
      metadata: { held, need, what },
    });
    logApiError(
      'tontine/orchestrator:escrow_shortfall',
      new Error(`Tontine ${tontineId} tour ${round} : séquestre ${held} < requis ${need} (${what})`)
    );
    return {
      ok: false,
      message: `Versement suspendu : séquestre insuffisant (détenu ${held.toLocaleString('fr-FR')} ${cy}, requis ${need.toLocaleString('fr-FR')} ${cy}). Rapprochement requis.`,
      status: 'ACTIVE',
      currentRound: round,
    };
  };

  // ── Distribution selon le type ─────────────────────────────
  if (!alreadySettled && (distribution === 'rotating' || distribution === 'project')) {
    const recipient =
      distribution === 'project'
        ? activeMembers.find((m) => m.orderPosition === 1) ?? activeMembers[0]
        : activeMembers.find((m) => m.orderPosition === round) ?? activeMembers[round - 1];
    if (!recipient) return { ok: false, message: 'Bénéficiaire introuvable pour ce tour.' };

    const wallet = await prisma.wallet.findUnique({ where: { userId: recipient.userId } });
    if (!wallet) return { ok: false, message: 'Le bénéficiaire n’a pas de wallet — versement impossible.' };

    if (held + 0.01 < pot) return shortfall(pot, `versement tour ${round}`);

    const payout = await postDoubleEntry({
      fromWalletId: escrow.id,
      toWalletId: wallet.id,
      type: 'TONTINE_PAYOUT',
      amount: pot,
      description:
        distribution === 'project'
          ? `Cagnotte Tontine Projet « ${tontine.name} »`
          : `Versement Tontine « ${tontine.name} » — Tour ${round}`,
      descriptionTo:
        distribution === 'project'
          ? `Cagnotte du projet « ${tontine.name} »`
          : `Cagnotte reçue — « ${tontine.name} » Tour ${round}`,
      referenceId: tontineId,
      idempotencyKey: `TPAYOUT-${tontineId}-${round}`,
      metadata: { tontineId, round, recipientMemberId: recipient.id, distribution },
    });
    if (!payout.success) return { ok: false, message: payout.error ?? 'Versement impossible.' };

    await prisma.$transaction([
      prisma.tontineMember.update({ where: { id: recipient.id }, data: { totalReceived: { increment: pot } } }),
      prisma.tontineSchedule.updateMany({
        where: { tontineId, round }, data: { isPaid: true, paidAt: new Date(), recipientId: recipient.userId },
      }),
    ]);

    void notify({
      userId: recipient.userId, category: 'TONTINE', priority: 'HIGH',
      title: distribution === 'project' ? 'Cagnotte du projet reçue 🎯' : 'Vous avez reçu la cagnotte 🎉',
      body: `${pot.toLocaleString('fr-FR')} ${cy} versés sur votre wallet — « ${tontine.name} ».`,
      actionUrl: '/wallet',
    });
    void recordTontineEvent({
      tontineId, type: 'PAYOUT', actorId: recipient.userId, round, amount: pot,
      metadata: { distribution },
    });
  }

  // ── Croissance / Achat solo : restitution en fin de cycle ──
  //    growth → à chaque membre ce qu'il a versé
  //    solo   → à l'unique membre la totalité de son épargne (= l'article)
  if ((distribution === 'growth' || distribution === 'solo') && isLast) {
    const owedByMember = activeMembers
      .map((m) => ({ member: m, back: Number(m.totalContributed) - Number(m.totalReceived) }))
      .filter((x) => x.back > 0);
    const totalOwed = Math.round(owedByMember.reduce((s, x) => s + x.back, 0) * 100) / 100;

    // Rien ne part tant que le séquestre ne couvre pas l'intégralité —
    // évite une restitution partielle (certains servis, d'autres non).
    if (totalOwed > 0 && held + 0.01 < totalOwed) {
      return shortfall(totalOwed, isSolo ? 'restitution achat solo' : 'restitution croissance');
    }

    for (const { member: m, back } of owedByMember) {
      const w = await prisma.wallet.findUnique({ where: { userId: m.userId } });
      if (!w) continue;
      const r = await postDoubleEntry({
        fromWalletId: escrow.id,
        toWalletId: w.id,
        type: 'TONTINE_PAYOUT',
        amount: back,
        description: isSolo
          ? `Épargne achat « ${tontine.name} » débloquée${tontine.purchaseItem ? ` — ${tontine.purchaseItem}` : ''}`
          : `Restitution épargne Tontine Croissance « ${tontine.name} »`,
        descriptionTo: isSolo
          ? `Achat finançable — « ${tontine.name} »`
          : `Épargne restituée — « ${tontine.name} »`,
        referenceId: tontineId,
        idempotencyKey: `TPAYOUT-${tontineId}-final-${m.id}`,
        metadata: { tontineId, memberId: m.id, distribution },
      });
      if (r.success) {
        await prisma.tontineMember.update({ where: { id: m.id }, data: { totalReceived: { increment: back } } });
      }
    }
    await prisma.tontineSchedule.updateMany({ where: { tontineId }, data: { isPaid: true, paidAt: new Date() } });
    void notifyMany(activeMembers.map((m) => m.userId), isSolo
      ? {
          category: 'TONTINE', priority: 'HIGH',
          title: 'Votre achat est finançable 🛒',
          body: `« ${tontine.name} » : ${totalOwed.toLocaleString('fr-FR')} ${cy} recrédités sur votre wallet${tontine.purchaseItem ? ` pour acheter ${tontine.purchaseItem}` : ''}.`,
          actionUrl: '/wallet',
        }
      : {
          category: 'TONTINE', priority: 'HIGH',
          title: 'Épargne restituée 📈',
          body: `Le cycle de « ${tontine.name} » est terminé : votre épargne a été recréditée sur votre wallet.`,
          actionUrl: '/wallet',
        });
    void recordTontineEvent({ tontineId, type: 'PAYOUT', round, amount: totalOwed, metadata: { distribution } });
  }

  // ── Avancement / clôture ──────────────────────────────────
  if (isLast) {
    await prisma.tontine.update({ where: { id: tontineId }, data: { status: 'COMPLETED', completedAt: new Date() } });
    void recordTontineEvent({ tontineId, type: 'COMPLETED', round });
    if (distribution !== 'growth' && distribution !== 'solo') {
      void notifyMany(activeMembers.map((m) => m.userId), {
        category: 'TONTINE', priority: 'NORMAL',
        title: `Tontine « ${tontine.name} » terminée`,
        body: 'Le cycle est bouclé. Merci de votre participation !',
        actionUrl: `/tontine/${tontineId}`,
      });
    }
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.tontine.update({
        where: { id: tontineId }, data: { currentRound: round + 1, nextContributionDate: nextDue },
      });
      await createRoundContributions(tx, tontineId, activeMembers, round + 1, amount, nextDue);
    });
    advanced = true;
    void recordTontineEvent({ tontineId, type: 'ROUND_ADVANCED', round: round + 1 });
    void notifyMany(activeMembers.map((m) => m.userId), {
      category: 'TONTINE', priority: 'NORMAL',
      title: `Tour ${round + 1} — « ${tontine.name} »`,
      body: `Cotisation de ${amount.toLocaleString('fr-FR')} ${cy} attendue pour le ${nextDue.toLocaleDateString('fr-FR')}.`,
      actionUrl: `/tontine/${tontineId}`,
    });
  }

  return {
    ok: true,
    message: isLast ? 'Tontine terminée.' : advanced ? `Versement effectué, passage au tour ${round + 1}.` : `Tour ${round} traité.`,
    status: isLast ? 'COMPLETED' : 'ACTIVE',
    currentRound: isLast ? round : round + 1,
  };
}

// ------------------------------------------------------------
// Tick (cron) : retards + relances
// ------------------------------------------------------------
export async function runTontineTick(): Promise<{
  tontinesScanned: number;
  roundsAdvanced: number;
  lateMarked: number;
  remindersSent: number;
}> {
  const now = Date.now();
  const actives = await prisma.tontine.findMany({
    where: { status: 'ACTIVE' },
    include: { members: { where: { status: 'ACTIVE' } } },
  });

  let roundsAdvanced = 0;
  let lateMarked = 0;
  let remindersSent = 0;

  for (const t of actives) {
    // 1. Cotisations en retard du tour courant
    const late = await prisma.tontineContribution.updateMany({
      where: { tontineId: t.id, round: t.currentRound, status: 'PENDING', dueDate: { lt: new Date() } },
      data: { status: 'LATE' },
    });
    lateMarked += late.count;
    if (late.count > 0) {
      void recordTontineEvent({ tontineId: t.id, type: 'CONTRIBUTION_LATE', round: t.currentRound, metadata: { count: late.count } });
    }

    // 2. Relances (échéance dans ≤ 2 j ou dépassée)
    const due = t.nextContributionDate ? new Date(t.nextContributionDate).getTime() : null;
    if (due !== null && due - now <= 2 * DAY) {
      const unpaid = await prisma.tontineContribution.findMany({
        where: { tontineId: t.id, round: t.currentRound, status: { in: ['PENDING', 'LATE'] } },
        include: { member: { select: { userId: true } } },
      });
      for (const c of unpaid) {
        // Anti-spam : pas deux relances en 20 h
        const recent = await prisma.notification.findFirst({
          where: {
            userId: c.member.userId, category: 'TONTINE',
            title: { startsWith: 'Rappel de cotisation' },
            createdAt: { gt: new Date(now - 20 * 3600_000) },
          },
          select: { id: true },
        });
        if (recent) continue;
        const overdue = due < now;
        await notify({
          userId: c.member.userId,
          category: 'TONTINE',
          priority: overdue ? 'HIGH' : 'NORMAL',
          title: 'Rappel de cotisation',
          body: overdue
            ? `Votre cotisation pour « ${t.name} » (tour ${t.currentRound}) est en retard. Réglez-la pour ne pas bloquer le groupe.`
            : `Cotisation « ${t.name} » (tour ${t.currentRound}) à régler avant le ${new Date(due).toLocaleDateString('fr-FR')}.`,
          actionUrl: `/tontine/${t.id}`,
        });
        remindersSent++;
      }
    }

    // 3. Le tour est peut-être complet mais non avancé (échec précédent)
    const res = await checkAndAdvanceRound(t.id);
    if (res.ok && res.message.startsWith('Versement')) roundsAdvanced++;
  }

  return { tontinesScanned: actives.length, roundsAdvanced, lateMarked, remindersSent };
}

function cur(c?: string | null): string {
  return c === 'XOF' || c === 'XAF' || !c ? 'FCFA' : c;
}
