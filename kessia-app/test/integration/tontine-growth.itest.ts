import { describe, it, expect, afterEach } from 'vitest';
import { activateTontine, checkAndAdvanceRound } from '@/lib/tontine/orchestrator';
import { getWalletBalance } from '@/lib/ledger/ledger.service';
import { reconcileTontineEscrow } from '@/lib/tontine/escrow';
import { totalRoundsForType } from '@/lib/tontine/type-meta';
import { prisma, makeUser, cleanup, tag, settle, contributeRound, escrowBalance } from './helpers';

const userIds: string[] = [];
const tontineIds: string[] = [];
afterEach(async () => {
  await settle();
  await cleanup({ userIds: userIds.splice(0), tontineIds: tontineIds.splice(0) });
});

describe('Orchestrateur de tontine — type Croissance + séquestre (intégration)', () => {
  it('N tours accumulés dans le séquestre, restitution intégrale au dernier tour (net = 0), séquestre vidé', async () => {
    const amount = 6_000;
    const totalRounds = totalRoundsForType('GROWTH', 2);
    expect(totalRounds).toBe(2);

    const members = await Promise.all([
      makeUser({ balance: amount * totalRounds }),
      makeUser({ balance: amount * totalRounds }),
    ]);
    members.forEach((m) => userIds.push(m.id));

    const now = new Date();
    const tontine = await prisma.tontine.create({
      data: {
        name: `IT Croissance ${tag()}`,
        type: 'GROWTH',
        amount, currency: 'XOF', frequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 86_400_000),
        maxMembers: 2, totalRounds,
        inviteCode: `IT-${tag()}`, createdById: members[0].id,
        members: {
          create: members.map((m, i) => ({
            userId: m.id, status: 'ACTIVE', joinedAt: new Date(now.getTime() - (2 - i) * 1000),
          })),
        },
      },
    });
    tontineIds.push(tontine.id);

    expect((await activateTontine(tontine.id)).ok).toBe(true);

    // ── Tours 1..N-1 : cotisations accumulées dans le séquestre, aucun versement ──
    for (let round = 1; round < totalRounds; round++) {
      await contributeRound(tontine.id, round);
      const r = await checkAndAdvanceRound(tontine.id);
      expect(r.ok).toBe(true);
      expect(r.status).toBe('ACTIVE');
      expect(await escrowBalance(tontine.id)).toBe(amount * 2 * round); // 2 membres × `round` tours
      for (const m of members) {
        expect(await getWalletBalance(m.walletId), `aucune restitution avant le dernier tour (tour ${round})`).toBe(
          amount * totalRounds - amount * round
        );
      }
      expect((await reconcileTontineEscrow(tontine.id)).balanced).toBe(true);
    }

    // ── Dernier tour : restitution ──
    await contributeRound(tontine.id, totalRounds);
    expect(await escrowBalance(tontine.id)).toBe(amount * 2 * totalRounds); // plein
    const last = await checkAndAdvanceRound(tontine.id);
    expect(last.ok).toBe(true);
    expect(last.status).toBe('COMPLETED');

    const expectedBack = amount * totalRounds;
    for (const m of members) {
      expect(await getWalletBalance(m.walletId)).toBe(expectedBack); // récupère exactement sa mise
    }
    expect(await escrowBalance(tontine.id)).toBe(0); // séquestre vidé
    const rec = await reconcileTontineEscrow(tontine.id);
    expect(rec.balanced).toBe(true);
    expect(rec.held).toBe(0);

    // idempotence par membre : 2 jambes (:out séquestre / :in membre) par restitution
    expect(
      await prisma.ledgerEntry.count({ where: { idempotencyKey: { startsWith: `TPAYOUT-${tontine.id}-final-` } } })
    ).toBe(members.length * 2);

    // ── Rejouer ne restitue pas une seconde fois ──
    const replay = await checkAndAdvanceRound(tontine.id);
    expect(replay.ok).toBe(false);
    for (const m of members) {
      expect(await getWalletBalance(m.walletId)).toBe(expectedBack);
    }
    expect(await escrowBalance(tontine.id)).toBe(0);
  }, 240_000);
});
