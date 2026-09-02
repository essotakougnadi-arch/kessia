// ============================================================
// KESSIA — Tontine Achat « individuelle » (§6.4)
//
// Une personne seule épargne pour son propre article : N versements
// détenus sur le compte séquestre, puis restitution intégrale sur son
// wallet au dernier versement. Vérifie contre une vraie base :
//   · activation avec 1 seul membre (pas de garde « ≥ 2 »)
//   · le séquestre détient exactement Σ des versements réglés
//   · aucun versement avant le dernier tour
//   · au dernier tour : wallet = mise initiale (l'argent lui revient),
//     séquestre vidé, invariant `reconcileTontineEscrow` aligné
//   · rejouer `checkAndAdvanceRound` ne restitue pas deux fois
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { activateTontine, checkAndAdvanceRound } from '@/lib/tontine/orchestrator';
import { getWalletBalance } from '@/lib/ledger/ledger.service';
import { reconcileTontineEscrow } from '@/lib/tontine/escrow';
import { soloContributionAmount } from '@/lib/tontine/type-meta';
import { prisma, makeUser, cleanup, tag, settle, contributeRound, escrowBalance } from './helpers';

const userIds: string[] = [];
const tontineIds: string[] = [];
afterEach(async () => {
  await settle();
  await cleanup({ userIds: userIds.splice(0), tontineIds: tontineIds.splice(0) });
});

describe('Tontine Achat individuelle — séquestre + restitution (intégration)', () => {
  it('N versements en séquestre, restitution intégrale au dernier, séquestre vidé', async () => {
    const targetAmount = 180_000;
    const plannedRounds = 6;
    const amount = soloContributionAmount(targetAmount, plannedRounds); // 30 000
    expect(amount).toBe(30_000);

    const buyer = await makeUser({ balance: amount * plannedRounds });
    userIds.push(buyer.id);

    const now = new Date();
    const tontine = await prisma.tontine.create({
      data: {
        name: `IT Achat solo ${tag()}`,
        type: 'PURCHASE',
        purchaseMode: 'SOLO',
        purchaseItem: 'Presse à jus inox',
        targetAmount,
        amount,
        currency: 'XOF',
        frequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 86_400_000),
        maxMembers: 1,
        totalRounds: plannedRounds,
        inviteCode: `IT-${tag()}`,
        createdById: buyer.id,
        members: {
          create: [{ userId: buyer.id, status: 'ACTIVE', joinedAt: new Date(now.getTime() - 1000) }],
        },
      },
    });
    tontineIds.push(tontine.id);

    // Activation avec UN SEUL membre — spécifique au mode solo
    const activated = await activateTontine(tontine.id);
    expect(activated.ok).toBe(true);
    expect(activated.status).toBe('ACTIVE');

    const fresh = await prisma.tontine.findUniqueOrThrow({ where: { id: tontine.id } });
    expect(fresh.totalRounds).toBe(plannedRounds);

    // ── Versements 1..N-1 : accumulés en séquestre, aucune restitution ──
    for (let round = 1; round < plannedRounds; round++) {
      await contributeRound(tontine.id, round);
      const r = await checkAndAdvanceRound(tontine.id);
      expect(r.ok).toBe(true);
      expect(r.status).toBe('ACTIVE');
      expect(await escrowBalance(tontine.id)).toBe(amount * round);
      expect(await getWalletBalance(buyer.walletId), `pas de restitution avant le dernier versement (tour ${round})`)
        .toBe(amount * plannedRounds - amount * round);
      expect((await reconcileTontineEscrow(tontine.id)).balanced).toBe(true);
    }

    // ── Dernier versement : déblocage intégral ──
    await contributeRound(tontine.id, plannedRounds);
    expect(await escrowBalance(tontine.id)).toBe(amount * plannedRounds);
    const last = await checkAndAdvanceRound(tontine.id);
    expect(last.ok).toBe(true);
    expect(last.status).toBe('COMPLETED');

    // L'argent lui revient : il retrouve exactement sa mise totale
    expect(await getWalletBalance(buyer.walletId)).toBe(amount * plannedRounds);
    expect(await escrowBalance(tontine.id)).toBe(0);
    const rec = await reconcileTontineEscrow(tontine.id);
    expect(rec.balanced).toBe(true);
    expect(rec.held).toBe(0);

    // 2 jambes ledger (séquestre → membre) pour la restitution finale
    expect(
      await prisma.ledgerEntry.count({ where: { idempotencyKey: { startsWith: `TPAYOUT-${tontine.id}-final-` } } })
    ).toBe(2);

    // ── Rejouer ne restitue pas une seconde fois ──
    const replay = await checkAndAdvanceRound(tontine.id);
    expect(replay.ok).toBe(false);
    expect(await getWalletBalance(buyer.walletId)).toBe(amount * plannedRounds);
    expect(await escrowBalance(tontine.id)).toBe(0);
  }, 240_000);

  it('refuse l’activation d’une tontine de groupe restée à 1 membre (garde inchangée)', async () => {
    const u = await makeUser({ balance: 0 });
    userIds.push(u.id);
    const now = new Date();
    const tontine = await prisma.tontine.create({
      data: {
        name: `IT groupe 1 membre ${tag()}`,
        type: 'PURCHASE', purchaseMode: 'GROUP',
        amount: 10_000, currency: 'XOF', frequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 86_400_000),
        maxMembers: 4, totalRounds: 4,
        inviteCode: `IT-${tag()}`, createdById: u.id,
        members: { create: [{ userId: u.id, status: 'ACTIVE', joinedAt: now }] },
      },
    });
    tontineIds.push(tontine.id);
    const r = await activateTontine(tontine.id);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/2 membres/);
  }, 120_000);
});
