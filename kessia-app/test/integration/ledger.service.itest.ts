import { describe, it, expect, afterEach } from 'vitest';
import { createLedgerEntry, getWalletBalance } from '@/lib/ledger/ledger.service';
import { prisma, makeUser, cleanup, tag } from './helpers';

const userIds: string[] = [];
afterEach(async () => {
  await cleanup({ userIds: userIds.splice(0) });
});

describe('createLedgerEntry (intégration)', () => {
  it('un DEBIT réduit le solde et crée exactement une entrée', async () => {
    const u = await makeUser({ balance: 10_000 });
    userIds.push(u.id);

    const key = `IT-${tag()}`;
    const res = await createLedgerEntry({
      walletId: u.walletId,
      type: 'TRANSFER_OUT',
      direction: 'DEBIT',
      amount: 3_000,
      idempotencyKey: key,
    });

    expect(res.success).toBe(true);
    expect(res.balanceAfter).toBe(7_000);
    expect(await getWalletBalance(u.walletId)).toBe(7_000);

    const count = await prisma.ledgerEntry.count({ where: { idempotencyKey: key } });
    expect(count).toBe(1);
  });

  it('rejouer la même clé d’idempotence ne double pas l’écriture', async () => {
    const u = await makeUser({ balance: 10_000 });
    userIds.push(u.id);
    const key = `IT-${tag()}`;

    const first = await createLedgerEntry({
      walletId: u.walletId, type: 'TRANSFER_OUT', direction: 'DEBIT', amount: 2_500, idempotencyKey: key,
    });
    const replay = await createLedgerEntry({
      walletId: u.walletId, type: 'TRANSFER_OUT', direction: 'DEBIT', amount: 2_500, idempotencyKey: key,
    });

    expect(first.success && replay.success).toBe(true);
    expect(replay.entryId).toBe(first.entryId);
    expect(await getWalletBalance(u.walletId)).toBe(7_500); // débité UNE fois
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('un DEBIT supérieur au solde échoue et ne modifie rien', async () => {
    const u = await makeUser({ balance: 1_000 });
    userIds.push(u.id);

    const res = await createLedgerEntry({
      walletId: u.walletId, type: 'WITHDRAWAL', direction: 'DEBIT', amount: 5_000, idempotencyKey: `IT-${tag()}`,
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/insuffisant/i);
    expect(await getWalletBalance(u.walletId)).toBe(1_000);
    expect(await prisma.ledgerEntry.count({ where: { walletId: u.walletId } })).toBe(0);
  });

  it('un wallet verrouillé refuse toute écriture', async () => {
    const u = await makeUser({ balance: 10_000, locked: true });
    userIds.push(u.id);

    const res = await createLedgerEntry({
      walletId: u.walletId, type: 'DEPOSIT', direction: 'CREDIT', amount: 1_000, idempotencyKey: `IT-${tag()}`,
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/verrouill/i);
    expect(await getWalletBalance(u.walletId)).toBe(10_000);
  });
});
