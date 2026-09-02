import { describe, it, expect, afterEach } from 'vitest';
import { activateTontine, checkAndAdvanceRound } from '@/lib/tontine/orchestrator';
import { getWalletBalance } from '@/lib/ledger/ledger.service';
import { reconcileTontineEscrow } from '@/lib/tontine/escrow';
import { settleContribution } from '@/lib/tontine/contributions';
import { prisma, makeUser, cleanup, tag, settle, contributeRound, escrowBalance } from './helpers';

const userIds: string[] = [];
const tontineIds: string[] = [];
afterEach(async () => {
  await settle();
  await cleanup({ userIds: userIds.splice(0), tontineIds: tontineIds.splice(0) });
});

describe('Orchestrateur de tontine — type Projet + séquestre (intégration)', () => {
  it('cotisations → séquestre, puis versement à l’organisateur au tour complet ; séquestre remis à zéro ; pas de double versement', async () => {
    const amount = 5_000;
    const organizer = await makeUser({ balance: amount });
    const member = await makeUser({ balance: amount });
    userIds.push(organizer.id, member.id);

    const now = new Date();
    const tontine = await prisma.tontine.create({
      data: {
        name: `IT Projet ${tag()}`,
        type: 'PROJECT',
        amount, currency: 'XOF', frequency: 'MONTHLY',
        startDate: new Date(now.getTime() - 86_400_000),
        maxMembers: 2, totalRounds: 1,
        inviteCode: `IT-${tag()}`, createdById: organizer.id,
        members: {
          create: [
            { userId: organizer.id, status: 'ACTIVE', joinedAt: new Date(now.getTime() - 2000) },
            { userId: member.id, status: 'ACTIVE', joinedAt: new Date(now.getTime() - 1000) },
          ],
        },
      },
    });
    tontineIds.push(tontine.id);

    expect((await activateTontine(tontine.id)).ok).toBe(true);
    // le séquestre est créé à l'activation
    expect(await prisma.wallet.count({ where: { tontineId: tontine.id, kind: 'TONTINE_ESCROW' } })).toBe(1);

    // ── Cotisations : l'argent quitte les membres et est DÉTENU par le séquestre ──
    await contributeRound(tontine.id, 1);
    const pot = amount * 2;
    expect(await escrowBalance(tontine.id)).toBe(pot);
    expect(await getWalletBalance(organizer.walletId)).toBe(0);
    expect(await getWalletBalance(member.walletId)).toBe(0);
    expect((await reconcileTontineEscrow(tontine.id)).balanced).toBe(true);

    // ── Tour complet → versement depuis le séquestre ──
    const advanced = await checkAndAdvanceRound(tontine.id);
    expect(advanced.ok).toBe(true);
    expect(advanced.status).toBe('COMPLETED');

    expect(await getWalletBalance(organizer.walletId)).toBe(pot);
    expect(await getWalletBalance(member.walletId)).toBe(0);
    expect(await escrowBalance(tontine.id)).toBe(0); // séquestre vidé
    const rec = await reconcileTontineEscrow(tontine.id);
    expect(rec.balanced).toBe(true);
    expect(rec.held).toBe(0);

    // double entrée : une jambe :out (séquestre) + une jambe :in (organisateur)
    expect(
      await prisma.ledgerEntry.count({ where: { idempotencyKey: { startsWith: `TPAYOUT-${tontine.id}-1` } } })
    ).toBe(2);

    // ── Idempotence : rejouer ne verse pas une seconde fois ──
    const replay = await checkAndAdvanceRound(tontine.id);
    expect(replay.ok).toBe(false);
    expect(await getWalletBalance(organizer.walletId)).toBe(pot);
    expect(await escrowBalance(tontine.id)).toBe(0);
  }, 150_000);

  it('refuse le versement tant que toutes les cotisations ne sont pas réglées — le séquestre ne détient que ce qui est payé', async () => {
    const amount = 4_000;
    const organizer = await makeUser({ balance: amount });
    const member = await makeUser({ balance: amount });
    userIds.push(organizer.id, member.id);

    const now = new Date();
    const tontine = await prisma.tontine.create({
      data: {
        name: `IT Projet ${tag()}`, type: 'PROJECT', amount, currency: 'XOF',
        frequency: 'MONTHLY', startDate: new Date(now.getTime() - 86_400_000),
        maxMembers: 2, totalRounds: 1, inviteCode: `IT-${tag()}`, createdById: organizer.id,
        members: {
          create: [
            { userId: organizer.id, status: 'ACTIVE', joinedAt: new Date(now.getTime() - 2000) },
            { userId: member.id, status: 'ACTIVE', joinedAt: new Date(now.getTime() - 1000) },
          ],
        },
      },
    });
    tontineIds.push(tontine.id);

    await activateTontine(tontine.id);

    // une seule cotisation réglée sur deux, via le séquestre
    const orgMember = await prisma.tontineMember.findFirstOrThrow({
      where: { tontineId: tontine.id, userId: organizer.id }, select: { id: true },
    });
    await settleContribution({
      tontineId: tontine.id, memberId: orgMember.id, payerUserId: organizer.id,
      round: 1, amount, tontineName: tontine.name, currency: 'XOF',
    });

    const res = await checkAndAdvanceRound(tontine.id);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/1\/2/);
    expect(await getWalletBalance(organizer.walletId)).toBe(0);
    expect(await escrowBalance(tontine.id)).toBe(amount); // détient la seule cotisation payée
  }, 150_000);
});
