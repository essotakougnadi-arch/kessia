import { describe, it, expect, afterEach } from 'vitest';
import { activateTontine, checkAndAdvanceRound } from '@/lib/tontine/orchestrator';
import { getWalletBalance, postDoubleEntry } from '@/lib/ledger/ledger.service';
import { reconcileTontineEscrow, refundTontineEscrow } from '@/lib/tontine/escrow';
import { prisma, makeUser, cleanup, tag, settle, contributeRound, escrowBalance } from './helpers';

const userIds: string[] = [];
const tontineIds: string[] = [];
afterEach(async () => {
  await settle();
  await cleanup({ userIds: userIds.splice(0), tontineIds: tontineIds.splice(0) });
});

async function makeRotating(amount: number, memberCount: number) {
  const members = await Promise.all(
    Array.from({ length: memberCount }, () => makeUser({ balance: amount * memberCount }))
  );
  members.forEach((m) => userIds.push(m.id));
  const now = new Date();
  const tontine = await prisma.tontine.create({
    data: {
      name: `IT Escrow ${tag()}`,
      type: 'CLASSIC_ROTATING',
      amount, currency: 'XOF', frequency: 'MONTHLY',
      startDate: new Date(now.getTime() - 86_400_000),
      maxMembers: memberCount, totalRounds: memberCount,
      inviteCode: `IT-${tag()}`, createdById: members[0].id,
      members: {
        create: members.map((m, i) => ({
          userId: m.id, status: 'ACTIVE', joinedAt: new Date(now.getTime() - (memberCount - i) * 1000),
        })),
      },
    },
  });
  tontineIds.push(tontine.id);
  return { tontine, members };
}

describe('Séquestre de tontine — invariant sur un cycle complet (intégration)', () => {
  it('cycle tournant 2×2 : le séquestre détient exactement la cagnotte du tour en cours, 0 entre les tours, et l’argent est conservé', async () => {
    const amount = 5_000;
    const { tontine, members } = await makeRotating(amount, 2);
    expect((await activateTontine(tontine.id)).ok).toBe(true);

    const pot = amount * 2;
    const startTotal = amount * 2 * members.length; // solde total initial

    for (let round = 1; round <= 2; round++) {
      await contributeRound(tontine.id, round);
      // séquestre détient la cagnotte pleine du tour, comptes alignés
      const midRec = await reconcileTontineEscrow(tontine.id);
      expect(midRec.held).toBe(pot);
      expect(midRec.balanced).toBe(true);

      const res = await checkAndAdvanceRound(tontine.id);
      expect(res.ok).toBe(true);

      // séquestre vidé après le versement + conservation de la masse
      const balances = await Promise.all(members.map((m) => getWalletBalance(m.walletId)));
      const escrowNow = await escrowBalance(tontine.id);
      expect(escrowNow).toBe(0);
      let sum = escrowNow;
      for (const b of balances) sum += b ?? 0;
      expect(sum).toBe(startTotal);
    }

    const t = await prisma.tontine.findUnique({ where: { id: tontine.id } });
    expect(t?.status).toBe('COMPLETED');

    const finalRec = await reconcileTontineEscrow(tontine.id);
    expect(finalRec.held).toBe(0);
    expect(finalRec.balanced).toBe(true);

    // chaque membre a reçu la cagnotte une fois → revenu à son solde de départ
    for (const m of members) {
      expect(await getWalletBalance(m.walletId)).toBe(amount * 2);
    }

    // chaque cotisation a bien deux jambes (membre + séquestre)
    const legs = await prisma.ledgerEntry.count({
      where: { idempotencyKey: { startsWith: `TCONTRIB-` }, referenceId: tontine.id },
    });
    expect(legs).toBe(2 /* rounds */ * 2 /* membres */ * 2 /* jambes */);
  }, 300_000);

  it('versement refusé si le séquestre est sous-financé (cotisations marquées PAID hors circuit)', async () => {
    const amount = 7_000;
    const { tontine, members } = await makeRotating(amount, 2);
    await activateTontine(tontine.id);

    // on marque les cotisations PAID SANS passer par le séquestre
    await prisma.tontineContribution.updateMany({
      where: { tontineId: tontine.id, round: 1 },
      data: { status: 'PAID', paidAt: new Date() },
    });

    const rec = await reconcileTontineEscrow(tontine.id);
    expect(rec.balanced).toBe(false);
    expect(rec.drift).toBeLessThan(0); // détient moins qu'attendu

    const res = await checkAndAdvanceRound(tontine.id);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/séquestre/i);
    expect(res.status).toBe('ACTIVE'); // pas d'avancement

    // aucun bénéficiaire n'a été crédité
    for (const m of members) {
      expect(await getWalletBalance(m.walletId)).toBe(amount * 2);
    }
    // un événement de rapprochement a été journalisé
    const shortfall = await prisma.tontineEvent.count({
      where: { tontineId: tontine.id, type: 'ESCROW_SHORTFALL' },
    });
    expect(shortfall).toBeGreaterThanOrEqual(1);
  }, 150_000);

  it('refundTontineEscrow rembourse les cotisants au prorata et vide le séquestre', async () => {
    const amount = 4_000;
    const { tontine, members } = await makeRotating(amount, 3);
    await activateTontine(tontine.id);
    await contributeRound(tontine.id, 1);
    expect(await escrowBalance(tontine.id)).toBe(amount * 3);

    const r = await refundTontineEscrow(tontine.id, 'test');
    expect(r.refunded).toBe(3);
    expect(r.totalAmount).toBe(amount * 3);
    expect(await escrowBalance(tontine.id)).toBe(0);
    for (const m of members) {
      expect(await getWalletBalance(m.walletId)).toBe(amount * 3); // solde initial restauré
    }

    // idempotent : rejouer ne rembourse pas deux fois
    const again = await refundTontineEscrow(tontine.id, 'test');
    expect(again.refunded).toBe(0);
  }, 150_000);
});

describe('postDoubleEntry — propriétés (intégration)', () => {
  it('déplace atomiquement, est idempotent, garde le solde et refuse un wallet verrouillé', async () => {
    const a = await makeUser({ balance: 1_000 });
    const b = await makeUser({ balance: 0 });
    const locked = await makeUser({ balance: 0, locked: true });
    userIds.push(a.id, b.id, locked.id);

    const key = `IT-DE-${tag()}`;
    const first = await postDoubleEntry({
      fromWalletId: a.walletId, toWalletId: b.walletId,
      type: 'TRANSFER_OUT', amount: 300, description: 'IT double entry',
      idempotencyKey: key,
    });
    expect(first.success).toBe(true);
    expect(await getWalletBalance(a.walletId)).toBe(700);
    expect(await getWalletBalance(b.walletId)).toBe(300);
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: { startsWith: key } } })).toBe(2);

    // rejeu : aucun mouvement supplémentaire
    const replay = await postDoubleEntry({
      fromWalletId: a.walletId, toWalletId: b.walletId,
      type: 'TRANSFER_OUT', amount: 300, description: 'IT double entry',
      idempotencyKey: key,
    });
    expect(replay.success).toBe(true);
    expect(await getWalletBalance(a.walletId)).toBe(700);
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: { startsWith: key } } })).toBe(2);

    // solde insuffisant : rien ne bouge
    const broke = await postDoubleEntry({
      fromWalletId: a.walletId, toWalletId: b.walletId,
      type: 'TRANSFER_OUT', amount: 999_999, description: 'IT overspend',
      idempotencyKey: `IT-DE-${tag()}`,
    });
    expect(broke.success).toBe(false);
    expect(broke.error).toMatch(/insuffisant/i);
    expect(await getWalletBalance(a.walletId)).toBe(700);

    // destination verrouillée : rien ne bouge
    const toLocked = await postDoubleEntry({
      fromWalletId: a.walletId, toWalletId: locked.walletId,
      type: 'TRANSFER_OUT', amount: 100, description: 'IT to locked',
      idempotencyKey: `IT-DE-${tag()}`,
    });
    expect(toLocked.success).toBe(false);
    expect(await getWalletBalance(a.walletId)).toBe(700);
    expect(await getWalletBalance(locked.walletId)).toBe(0);
  }, 150_000);
});
