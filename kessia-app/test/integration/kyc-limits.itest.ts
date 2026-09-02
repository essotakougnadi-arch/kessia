import { describe, it, expect, afterEach } from 'vitest';
import { checkOutboundLimit } from '@/lib/kyc/limits';
import { prisma, makeUser, cleanup, tag } from './helpers';

const userIds: string[] = [];
afterEach(async () => {
  await cleanup({ userIds: userIds.splice(0) });
});

/** Insère une sortie « ce mois-ci » directement (on teste l'agrégation, pas le ledger). */
async function outbound(walletId: string, amount: number) {
  await prisma.ledgerEntry.create({
    data: {
      walletId, type: 'TRANSFER_OUT', direction: 'DEBIT',
      amount, balanceBefore: amount, balanceAfter: 0,
      status: 'COMPLETED', idempotencyKey: `IT-${tag()}`, processedAt: new Date(),
    },
  });
}

describe('checkOutboundLimit (intégration, §30)', () => {
  it('agrège les sorties du mois et calcule le restant', async () => {
    const u = await makeUser({ kycStatus: 'NOT_STARTED' }); // palier 0 : 50k / opé, 150k / mois
    userIds.push(u.id);
    await outbound(u.walletId, 30_000);
    await outbound(u.walletId, 10_000);

    const check = await checkOutboundLimit(u.id, 5_000);
    expect(check.allowed).toBe(true);
    expect(check.usedThisMonth).toBe(40_000);
    expect(check.remainingThisMonth).toBe(110_000);
  });

  it('refuse une opération au-dessus du plafond par transaction', async () => {
    const u = await makeUser({ kycStatus: 'NOT_STARTED' });
    userIds.push(u.id);

    const check = await checkOutboundLimit(u.id, 60_000); // > 50 000
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/plafond/i);
  });

  it('refuse une opération qui ferait dépasser le plafond mensuel', async () => {
    const u = await makeUser({ kycStatus: 'NOT_STARTED' });
    userIds.push(u.id);
    await outbound(u.walletId, 120_000);

    const check = await checkOutboundLimit(u.id, 40_000); // 120k + 40k = 160k > 150k
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/mensuel/i);
  });

  it('un compte vérifié niveau 2 a des plafonds bien plus élevés', async () => {
    const u = await makeUser({ kycStatus: 'VERIFIED', kycLevel: 2 });
    userIds.push(u.id);

    const check = await checkOutboundLimit(u.id, 1_500_000); // OK au palier 2 (2M / opé)
    expect(check.allowed).toBe(true);
    expect(check.tier.tier).toBe(2);
  });
});
