// ============================================================
// KESSIA — GET /api/v1/discover
// Fil public de découverte : tontines publiques ouvertes,
// triées par date de création (les plus récentes d'abord).
// Aucune authentification — alimente la landing, /discover et
// l'accueil. Les DONNÉES sont publiques par choix (§6) ; toute
// ACTION (rejoindre) exige un compte.
// ============================================================

import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const LIMIT = 24;

export async function GET(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, 'discover', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const raw = await prisma.tontine.findMany({
      where: { isPublic: true, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: LIMIT * 2,
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        purchaseMode: true,
        purchaseItem: true,
        amount: true,
        targetAmount: true,
        currency: true,
        frequency: true,
        maxMembers: true,
        totalRounds: true,
        membershipConditions: true,
        createdAt: true,
        createdBy: { select: { firstName: true } },
        _count: { select: { members: { where: { status: 'ACTIVE' } } } },
      },
    });

    const tontines = raw
      .filter((t) => t._count.members < t.maxMembers)
      .slice(0, LIMIT)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        type: t.type,
        purchaseMode: t.purchaseMode,
        purchaseItem: t.purchaseItem,
        amount: Number(t.amount),
        targetAmount: t.targetAmount != null ? Number(t.targetAmount) : null,
        currency: t.currency,
        frequency: t.frequency,
        maxMembers: t.maxMembers,
        totalRounds: t.totalRounds,
        memberCount: t._count.members,
        seatsLeft: t.maxMembers - t._count.members,
        hasConditions: !!t.membershipConditions,
        createdByFirstName: t.createdBy.firstName,
        createdAt: t.createdAt,
      }));

    return ok({ tontines });
  } catch (error) {
    logApiError('/v1/discover', error);
    return serverError();
  }
}
