// ============================================================
// KESSIA — Fonds de Garantie Solidaire · service (§6.5)
// ⚠️ MODE DÉMONSTRATION — aucun mouvement de fonds réel. Voir ADR 0010.
// ============================================================

import prisma from '@/lib/db/prisma';
import type { GuaranteeClaimStatus, GuaranteeEventType } from '@prisma/client';
import { notify } from '@/lib/notifications/notify';
import { recordAudit } from '@/lib/audit/audit.service';
import { recordTontineEvent } from '@/lib/tontine/events';
import { GUARANTEE_RULES, ALLOCATION_RATE } from './rules';

const DAY = 86_400_000;

// ------------------------------------------------------------
// Projection du fonds (aucune donnée réelle : tout est calculé)
// ------------------------------------------------------------
export type FundProjection = {
  status: 'SIMULATION';
  currency: string;
  allocationRatePct: number;
  /** cotisations de tontine cumulées (données réelles) */
  tontineContributionsTotal: number;
  /** part projetée affectée au fonds */
  projectedContributions: number;
  /** demandes réglées (simulation) */
  claimsSettledTotal: number;
  projectedBalance: number;
  claims: { pending: number; approved: number; settled: number; rejected: number };
  coverageRatio: number | null;
};

export async function getFundProjection(): Promise<FundProjection> {
  const [contribAgg, claims] = await Promise.all([
    // Base = cotisations de tontine effectivement réglées.
    prisma.tontineContribution.aggregate({
      where: { status: 'PAID' },
      _sum: { amount: true },
    }),
    prisma.guaranteeClaim.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amountRequested: true } }),
  ]);

  const contributionsTotal = Number(contribAgg._sum.amount ?? 0);
  const projected = Math.round(contributionsTotal * ALLOCATION_RATE);

  const byStatus = (s: GuaranteeClaimStatus) => claims.find((c) => c.status === s);
  const settledTotal = Number(byStatus('SETTLED')?._sum.amountRequested ?? 0);
  const balance = projected - settledTotal;

  return {
    status: 'SIMULATION',
    currency: GUARANTEE_RULES.currency,
    allocationRatePct: ALLOCATION_RATE * 100,
    tontineContributionsTotal: contributionsTotal,
    projectedContributions: projected,
    claimsSettledTotal: settledTotal,
    projectedBalance: balance,
    claims: {
      pending: byStatus('PENDING')?._count._all ?? 0,
      approved: byStatus('APPROVED')?._count._all ?? 0,
      settled: byStatus('SETTLED')?._count._all ?? 0,
      rejected: byStatus('REJECTED')?._count._all ?? 0,
    },
    coverageRatio: settledTotal > 0 ? projected / settledTotal : null,
  };
}

// ------------------------------------------------------------
// Éligibilité d'un membre
// ------------------------------------------------------------
export type Eligibility = { eligible: boolean; reasons: string[] };

export async function checkEligibility(userId: string, tontineId?: string): Promise<Eligibility> {
  const reasons: string[] = [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { kycStatus: true, createdAt: true },
  });
  if (!user) return { eligible: false, reasons: ['Compte introuvable.'] };

  if (GUARANTEE_RULES.eligibility.kycVerified && user.kycStatus !== 'VERIFIED') {
    reasons.push('Votre identité doit être vérifiée (KYC).');
  }

  const days = (Date.now() - user.createdAt.getTime()) / DAY;
  if (days < GUARANTEE_RULES.eligibility.minMembershipDays) {
    reasons.push(`Ancienneté minimale de ${GUARANTEE_RULES.eligibility.minMembershipDays} jours requise.`);
  }

  const onTime = await prisma.tontineContribution.count({
    where: { member: { userId }, status: 'PAID' },
  });
  if (onTime < GUARANTEE_RULES.eligibility.minOnTimeContributions) {
    reasons.push(`Au moins ${GUARANTEE_RULES.eligibility.minOnTimeContributions} cotisations réglées requises (vous en avez ${onTime}).`);
  }

  const yearAgo = new Date(Date.now() - 365 * DAY);
  const approvedThisYear = await prisma.guaranteeClaim.count({
    where: { userId, status: { in: ['APPROVED', 'SETTLED'] }, createdAt: { gte: yearAgo } },
  });
  if (approvedThisYear >= GUARANTEE_RULES.limits.maxApprovedClaimsPerYear) {
    reasons.push(`Limite de ${GUARANTEE_RULES.limits.maxApprovedClaimsPerYear} demandes approuvées sur 12 mois atteinte.`);
  }

  const open = await prisma.guaranteeClaim.count({
    where: { userId, status: { in: ['PENDING', 'APPROVED'] } },
  });
  if (open > 0) reasons.push('Vous avez déjà une demande en cours.');

  if (tontineId) {
    const member = await prisma.tontineMember.findFirst({
      where: { tontineId, userId, status: 'ACTIVE' },
    });
    if (!member) reasons.push('Vous devez être membre actif de la tontine concernée.');
  }

  return { eligible: reasons.length === 0, reasons };
}

// ------------------------------------------------------------
// Ouvrir une demande
// ------------------------------------------------------------
async function event(type: GuaranteeEventType, claimId: string, actorId: string, amount?: number, metadata?: Record<string, unknown>) {
  try {
    await prisma.guaranteeEvent.create({
      data: { type, claimId, actorId, amount: amount ?? undefined, metadata: (metadata ?? undefined) as never },
    });
  } catch (e) {
    console.error('[GUARANTEE_EVENT]', type, e);
  }
}

export async function openClaim(input: {
  userId: string;
  tontineId: string;
  round: number;
  reason: string;
}): Promise<{ ok: boolean; error?: string; claimId?: string }> {
  const elig = await checkEligibility(input.userId, input.tontineId);
  if (!elig.eligible) return { ok: false, error: elig.reasons[0] };

  const tontine = await prisma.tontine.findUnique({
    where: { id: input.tontineId },
    select: { amount: true, currentRound: true, name: true, createdById: true },
  });
  if (!tontine) return { ok: false, error: 'Tontine introuvable.' };

  const member = await prisma.tontineMember.findFirst({
    where: { tontineId: input.tontineId, userId: input.userId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!member) return { ok: false, error: 'Vous n’êtes pas membre de cette tontine.' };

  const contribution = await prisma.tontineContribution.findFirst({
    where: { memberId: member.id, round: input.round, status: { in: ['PENDING', 'LATE'] } },
  });
  if (!contribution) {
    return { ok: false, error: 'Aucune cotisation en attente ou en retard pour ce tour.' };
  }

  const amount = Number(contribution.amount);

  const claim = await prisma.guaranteeClaim.create({
    data: {
      userId: input.userId,
      tontineId: input.tontineId,
      round: input.round,
      amountRequested: amount,
      reason: input.reason.trim().slice(0, 500),
      status: 'PENDING',
      simulated: true,
    },
  });

  await event('CLAIM_OPENED', claim.id, input.userId, amount, { tontineId: input.tontineId, round: input.round });
  void recordTontineEvent({
    tontineId: input.tontineId, type: 'GUARANTEE_CLAIM', actorId: input.userId, round: input.round, amount,
  });
  void recordAudit({
    userId: input.userId, action: 'guarantee.claim_open', entity: 'GuaranteeClaim', entityId: claim.id,
    metadata: { tontineId: input.tontineId, round: input.round, amount },
  });

  // Notifier l'équipe conformité
  const reviewers = await prisma.user.findMany({
    where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE'] }, isActive: true },
    select: { id: true },
  });
  for (const r of reviewers) {
    void notify({
      userId: r.id, category: 'SYSTEM', priority: 'NORMAL',
      title: 'Fonds de Garantie — demande à examiner',
      body: `Nouvelle demande d'aide de ${amount.toLocaleString('fr-FR')} FCFA (tontine « ${tontine.name} »).`,
      actionUrl: '/admin/guarantee',
    });
  }

  return { ok: true, claimId: claim.id };
}

// ------------------------------------------------------------
// Revue d'une demande (COMPLIANCE)
// ------------------------------------------------------------
export async function reviewClaim(input: {
  claimId: string;
  decision: 'APPROVED' | 'REJECTED';
  note: string;
  reviewerId: string;
}): Promise<{ ok: boolean; error?: string; status?: GuaranteeClaimStatus }> {
  const claim = await prisma.guaranteeClaim.findUnique({ where: { id: input.claimId } });
  if (!claim) return { ok: false, error: 'Demande introuvable.' };
  if (claim.status !== 'PENDING') return { ok: false, error: `La demande est déjà « ${claim.status} ».` };
  if (input.decision === 'REJECTED' && input.note.trim().length < 5) {
    return { ok: false, error: 'Un motif de rejet est obligatoire.' };
  }

  const amount = Number(claim.amountRequested);

  if (input.decision === 'REJECTED') {
    await prisma.guaranteeClaim.update({
      where: { id: claim.id },
      data: { status: 'REJECTED', reviewedById: input.reviewerId, reviewedAt: new Date(), decisionNote: input.note.trim() },
    });
    await event('CLAIM_REJECTED', claim.id, input.reviewerId, amount, { note: input.note.trim() });
    void notify({
      userId: claim.userId, category: 'SYSTEM', priority: 'NORMAL',
      title: 'Fonds de Garantie — demande refusée',
      body: input.note.trim(),
      actionUrl: '/tontine/garantie',
    });
    void recordAudit({
      userId: input.reviewerId, action: 'guarantee.claim_reject', entity: 'GuaranteeClaim', entityId: claim.id,
      metadata: { amount },
    });
    return { ok: true, status: 'REJECTED' };
  }

  // APPROVED → réglé immédiatement dans la simulation (aucun mouvement réel)
  await prisma.guaranteeClaim.update({
    where: { id: claim.id },
    data: { status: 'SETTLED', reviewedById: input.reviewerId, reviewedAt: new Date(), decisionNote: input.note.trim() || 'Demande approuvée.' },
  });
  await event('CLAIM_APPROVED', claim.id, input.reviewerId, amount);
  await event('CLAIM_SETTLED', claim.id, input.reviewerId, amount, { mode: 'simulation' });

  void notify({
    userId: claim.userId, category: 'SYSTEM', priority: 'HIGH',
    title: 'Fonds de Garantie — demande approuvée',
    body: `Votre demande de ${amount.toLocaleString('fr-FR')} FCFA a été approuvée. Dans la version active du fonds, votre cotisation serait couverte. (Le fonds est en cours de mise en place.)`,
    actionUrl: '/tontine/garantie',
  });
  void recordAudit({
    userId: input.reviewerId, action: 'guarantee.claim_approve', entity: 'GuaranteeClaim', entityId: claim.id,
    metadata: { amount, mode: 'simulation' },
  });

  return { ok: true, status: 'SETTLED' };
}

// ------------------------------------------------------------
// Lectures
// ------------------------------------------------------------
export async function getUserClaims(userId: string) {
  return prisma.guaranteeClaim.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

export async function getAllClaims(status?: GuaranteeClaimStatus) {
  return prisma.guaranteeClaim.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: { user: { select: { firstName: true, lastName: true, phone: true } } },
  });
}

export async function getRecentEvents(limit = 40) {
  return prisma.guaranteeEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
}
