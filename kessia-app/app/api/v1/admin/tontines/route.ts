import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import prisma from '@/lib/db/prisma';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const tontines = await prisma.tontine.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        createdBy: { select: { firstName: true, lastName: true, phone: true } },
        _count: { select: { members: { where: { status: 'ACTIVE' } }, contributions: true } },
      },
    });

    // Séquestre (§6.5) : solde réel détenu + rapprochement vs comptabilité
    // des cotisations, en 3 requêtes groupées (pas de N+1).
    const ids = tontines.map((t) => t.id);
    const [escrows, paidSums, receivedSums] = await Promise.all([
      prisma.wallet.findMany({
        where: { kind: 'TONTINE_ESCROW', tontineId: { in: ids } },
        select: { tontineId: true, balance: true },
      }),
      prisma.tontineContribution.groupBy({
        by: ['tontineId'],
        where: { tontineId: { in: ids }, status: 'PAID' },
        _sum: { amount: true },
      }),
      prisma.tontineMember.groupBy({
        by: ['tontineId'],
        where: { tontineId: { in: ids } },
        _sum: { totalReceived: true },
      }),
    ]);
    const escrowBy = new Map(escrows.map((e) => [e.tontineId!, Number(e.balance)]));
    const paidBy = new Map(paidSums.map((r) => [r.tontineId, Number(r._sum.amount ?? 0)]));
    const receivedBy = new Map(receivedSums.map((r) => [r.tontineId, Number(r._sum.totalReceived ?? 0)]));

    return ok(
      tontines.map((t) => {
        const held = escrowBy.get(t.id) ?? 0;
        const expectedHeld = Math.round(((paidBy.get(t.id) ?? 0) - (receivedBy.get(t.id) ?? 0)) * 100) / 100;
        const drift = Math.round((held - expectedHeld) * 100) / 100;
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          type: t.type,
          amount: Number(t.amount),
          frequency: t.frequency,
          currentRound: t.currentRound,
          totalRounds: t.totalRounds,
          memberCount: t._count.members,
          contributionCount: t._count.contributions,
          createdBy: t.createdBy,
          createdAt: t.createdAt,
          escrow: {
            hasWallet: escrowBy.has(t.id),
            held,
            expectedHeld,
            drift,
            balanced: Math.abs(drift) < 0.01,
          },
        };
      })
    );
  } catch (e) {
    logApiError('/v1/admin/tontines', e);
    return serverError();
  }
}
