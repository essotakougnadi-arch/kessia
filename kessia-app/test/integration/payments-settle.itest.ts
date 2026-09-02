import { describe, it, expect, afterEach } from 'vitest';
import { settlePendingPayment } from '@/lib/payments';
import { getWalletBalance } from '@/lib/ledger/ledger.service';
import { prisma, makeUser, cleanup } from './helpers';

const userIds: string[] = [];
afterEach(async () => {
  await cleanup({ userIds: userIds.splice(0) });
});

async function pendingDeposit(userId: string, walletId: string, amount: number) {
  return prisma.paymentTransaction.create({
    data: {
      userId, walletId,
      provider: 'simulated-mobile-money', method: 'MOBILE_MONEY', direction: 'INBOUND',
      amount, currency: 'XOF', status: 'PENDING', simulated: true,
    },
  });
}

describe('settlePendingPayment (intégration, §44)', () => {
  it('COMPLETED : crédite le wallet une fois et lie l’entrée ledger', async () => {
    const u = await makeUser({ balance: 0 });
    userIds.push(u.id);
    const tx = await pendingDeposit(u.id, u.walletId, 12_000);

    const r = await settlePendingPayment({ reference: tx.id, result: 'COMPLETED', externalRef: 'EXT-1' });
    expect(r.ok && r.status).toBe('COMPLETED');
    expect(await getWalletBalance(u.walletId)).toBe(12_000);

    const settled = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
    expect(settled?.status).toBe('COMPLETED');
    expect(settled?.ledgerEntryId).toBeTruthy();
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: `PAYTX_${tx.id}` } })).toBe(1);
  });

  it('rejouer le même événement est un no-op (ALREADY_SETTLED)', async () => {
    const u = await makeUser({ balance: 0 });
    userIds.push(u.id);
    const tx = await pendingDeposit(u.id, u.walletId, 8_000);

    await settlePendingPayment({ reference: tx.id, result: 'COMPLETED' });
    const replay = await settlePendingPayment({ reference: tx.id, result: 'COMPLETED' });

    expect(replay.ok && replay.status).toBe('ALREADY_SETTLED');
    expect(await getWalletBalance(u.walletId)).toBe(8_000); // pas de double crédit
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: `PAYTX_${tx.id}` } })).toBe(1);
  });

  it('FAILED : passe en FAILED sans écriture ledger', async () => {
    const u = await makeUser({ balance: 0 });
    userIds.push(u.id);
    const tx = await pendingDeposit(u.id, u.walletId, 5_000);

    const r = await settlePendingPayment({ reference: tx.id, result: 'FAILED', failureReason: 'Refusé' });
    expect(r.ok && r.status).toBe('FAILED');
    expect(await getWalletBalance(u.walletId)).toBe(0);
    expect(await prisma.ledgerEntry.count({ where: { walletId: u.walletId } })).toBe(0);

    const failed = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
    expect(failed?.status).toBe('FAILED');
  });

  it('référence inconnue → NOT_FOUND', async () => {
    const r = await settlePendingPayment({ reference: 'paytx-inexistant', result: 'COMPLETED' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });
});
