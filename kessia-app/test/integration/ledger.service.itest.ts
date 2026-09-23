import { describe, it, expect, afterEach } from 'vitest';
import { createLedgerEntry, postDoubleEntry, getWalletBalance } from '@/lib/ledger/ledger.service';
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

  // ---- P1.6 : reproduction du constat P0.4 (concurrence réelle) --------

  it('CAS A — deux appels VRAIMENT concurrents, même clé, même intention : un seul effet financier', async () => {
    const u = await makeUser({ balance: 10_000 });
    userIds.push(u.id);
    const key = `IT-${tag()}`;

    const [a, b] = await Promise.all([
      createLedgerEntry({ walletId: u.walletId, type: 'WITHDRAWAL', direction: 'DEBIT', amount: 3_000, idempotencyKey: key }),
      createLedgerEntry({ walletId: u.walletId, type: 'WITHDRAWAL', direction: 'DEBIT', amount: 3_000, idempotencyKey: key }),
    ]);
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(a.entryId).toBe(b.entryId);
    expect(await getWalletBalance(u.walletId)).toBe(7_000); // débité UNE fois
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('CAS B — deux appels concurrents, clés DIFFÉRENTES, même compte : les deux réussissent indépendamment', async () => {
    const u = await makeUser({ balance: 10_000 });
    userIds.push(u.id);

    const [a, b] = await Promise.all([
      createLedgerEntry({ walletId: u.walletId, type: 'WITHDRAWAL', direction: 'DEBIT', amount: 2_000, idempotencyKey: `IT-${tag()}` }),
      createLedgerEntry({ walletId: u.walletId, type: 'WITHDRAWAL', direction: 'DEBIT', amount: 3_000, idempotencyKey: `IT-${tag()}` }),
    ]);
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(await getWalletBalance(u.walletId)).toBe(5_000); // 10000 - 2000 - 3000
    expect(await prisma.ledgerEntry.count({ where: { walletId: u.walletId } })).toBe(2);
  });

  it('CAS C/D — dix puis vingt appels VRAIMENT concurrents, même clé (createLedgerEntry) : un seul effet, jamais d’erreur', async () => {
    for (const n of [10, 20]) {
      const u = await makeUser({ balance: 50_000 });
      userIds.push(u.id);
      const key = `IT-${tag()}-${n}`;

      const results = await Promise.all(
        Array.from({ length: n }, () =>
          createLedgerEntry({ walletId: u.walletId, type: 'WITHDRAWAL', direction: 'DEBIT', amount: 4_000, idempotencyKey: key })
        )
      );
      expect(results.every((r) => r.success)).toBe(true); // createLedgerEntry seul (pas postDoubleEntry) : jamais d'échec ici
      expect(new Set(results.map((r) => r.entryId)).size).toBe(1); // toujours le même entryId
      expect(await getWalletBalance(u.walletId)).toBe(46_000); // un seul débit de 4000
      expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: key } })).toBe(1);
    }
  });

  it('CAS G — comptes DIFFÉRENTS, opérations concurrentes : ne se bloquent pas, chacun cohérent', async () => {
    const users = await Promise.all(Array.from({ length: 10 }, () => makeUser({ balance: 20_000 })));
    userIds.push(...users.map((u) => u.id));

    const results = await Promise.all(
      users.map((u) =>
        createLedgerEntry({ walletId: u.walletId, type: 'WITHDRAWAL', direction: 'DEBIT', amount: 5_000, idempotencyKey: `IT-${tag()}` })
      )
    );
    expect(results.every((r) => r.success)).toBe(true);
    const balances = await Promise.all(users.map((u) => getWalletBalance(u.walletId)));
    expect(balances.every((b) => b === 15_000)).toBe(true);
  });

  describe('postDoubleEntry — reproduction précise du constat P0.4 (Ledger core)', () => {
    it('CAS F — vingt appels VRAIMENT concurrents, même clé, sur un compte source dont le solde couvre EXACTEMENT une opération : plus jamais de faux « Solde insuffisant » (P1.6, correctif validé)', async () => {
      const seller = await makeUser({ balance: 0 });
      const escrowLike = await makeUser({ balance: 120_000 }); // simule un séquestre : solde = exactement le montant à verser
      userIds.push(seller.id, escrowLike.id);
      const key = `IT-${tag()}`;

      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          postDoubleEntry({
            fromWalletId: escrowLike.walletId, toWalletId: seller.walletId, type: 'SALE_PAYMENT',
            amount: 120_000, description: 'itest ledger P1.6', idempotencyKey: key,
          })
        )
      );

      // Avant le correctif P1.6 : certains appels échouaient en "Solde
      // insuffisant" malgré une clé d'idempotence identique déjà résolue
      // par un concurrent. Après correctif : TOUS réussissent proprement.
      expect(results.every((r) => r.success)).toBe(true);
      expect(new Set(results.map((r) => r.outEntryId)).size).toBe(1); // même écriture partout

      const outCount = await prisma.ledgerEntry.count({ where: { idempotencyKey: `${key}:out` } });
      const inCount = await prisma.ledgerEntry.count({ where: { idempotencyKey: `${key}:in` } });
      expect(outCount).toBe(1);
      expect(inCount).toBe(1);
      expect(await getWalletBalance(seller.walletId)).toBe(120_000); // jamais un multiple
      expect(await getWalletBalance(escrowLike.walletId)).toBe(0); // jamais négatif
    });

    it('vingt clés DIFFÉRENTES, postDoubleEntry concurrent, même compte source, fonds suffisants pour toutes : toutes réussissent', async () => {
      const escrowLike = await makeUser({ balance: 1_000_000 });
      const sellers = await Promise.all(Array.from({ length: 20 }, () => makeUser({ balance: 0 })));
      userIds.push(escrowLike.id, ...sellers.map((s) => s.id));

      const results = await Promise.all(
        sellers.map((s) =>
          postDoubleEntry({
            fromWalletId: escrowLike.walletId, toWalletId: s.walletId, type: 'SALE_PAYMENT',
            amount: 10_000, description: 'itest ledger P1.6 cles differentes', idempotencyKey: `IT-${tag()}`,
          })
        )
      );
      expect(results.every((r) => r.success)).toBe(true); // fonds largement suffisants : jamais de faux négatif
      expect(await getWalletBalance(escrowLike.walletId)).toBe(1_000_000 - 20 * 10_000);
      const balances = await Promise.all(sellers.map((s) => getWalletBalance(s.walletId)));
      expect(balances.every((b) => b === 10_000)).toBe(true);
    });

    it('insuffisance de fonds RÉELLE (pas une course) : refusée proprement, aucun état partiel (rollback)', async () => {
      const source = await makeUser({ balance: 5_000 });
      const dest = await makeUser({ balance: 0 });
      userIds.push(source.id, dest.id);

      const res = await postDoubleEntry({
        fromWalletId: source.walletId, toWalletId: dest.walletId, type: 'SALE_PAYMENT',
        amount: 50_000, description: 'itest insuffisance reelle', idempotencyKey: `IT-${tag()}`,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/insuffisant/i);

      // Rollback complet : ni débit ni crédit, aucune écriture partielle,
      // soldes strictement inchangés des deux côtés.
      expect(await getWalletBalance(source.walletId)).toBe(5_000);
      expect(await getWalletBalance(dest.walletId)).toBe(0);
      expect(await prisma.ledgerEntry.count({ where: { walletId: { in: [source.walletId, dest.walletId] } } })).toBe(0);
    });

    it('debit = credit et cohérence balanceBefore/balanceAfter sur plusieurs opérations chaînées', async () => {
      const source = await makeUser({ balance: 100_000 });
      const dest = await makeUser({ balance: 0 });
      userIds.push(source.id, dest.id);

      for (const amount of [10_000, 25_000, 7_500]) {
        const res = await postDoubleEntry({
          fromWalletId: source.walletId, toWalletId: dest.walletId, type: 'TRANSFER_OUT',
          amount, description: 'itest chainage', idempotencyKey: `IT-${tag()}`,
        });
        expect(res.success).toBe(true);
      }

      const outEntries = await prisma.ledgerEntry.findMany({ where: { walletId: source.walletId }, orderBy: { createdAt: 'asc' } });
      const inEntries = await prisma.ledgerEntry.findMany({ where: { walletId: dest.walletId }, orderBy: { createdAt: 'asc' } });
      expect(outEntries).toHaveLength(3);
      expect(inEntries).toHaveLength(3);

      // debit = credit pour chaque jambe d'une même opération.
      for (let i = 0; i < 3; i++) {
        expect(Number(outEntries[i].amount)).toBe(Number(inEntries[i].amount));
      }

      // Chaînage balanceBefore/balanceAfter : chaque entrée reprend
      // exactement le balanceAfter de la précédente sur le même wallet.
      let expectedBefore = 100_000;
      for (const e of outEntries) {
        expect(Number(e.balanceBefore)).toBe(expectedBefore);
        expect(Number(e.balanceBefore) - Number(e.amount)).toBe(Number(e.balanceAfter));
        expectedBefore = Number(e.balanceAfter);
      }
      expect(expectedBefore).toBe(100_000 - 10_000 - 25_000 - 7_500);

      let expectedCredit = 0;
      for (const e of inEntries) {
        expect(Number(e.balanceBefore)).toBe(expectedCredit);
        expect(Number(e.balanceBefore) + Number(e.amount)).toBe(Number(e.balanceAfter));
        expectedCredit = Number(e.balanceAfter);
      }
    });

    it('réconciliation : solde du wallet == solde initial + somme signée des écritures ledger (scénario contrôlé)', async () => {
      const source = await makeUser({ balance: 200_000 });
      const destA = await makeUser({ balance: 0 });
      const destB = await makeUser({ balance: 0 });
      userIds.push(source.id, destA.id, destB.id);

      await postDoubleEntry({
        fromWalletId: source.walletId, toWalletId: destA.walletId, type: 'TRANSFER_OUT',
        amount: 30_000, description: 'itest reconciliation A', idempotencyKey: `IT-${tag()}`,
      });
      await postDoubleEntry({
        fromWalletId: source.walletId, toWalletId: destB.walletId, type: 'TRANSFER_OUT',
        amount: 45_000, description: 'itest reconciliation B', idempotencyKey: `IT-${tag()}`,
      });
      // Rejeu (même montant, nouvelle clé = nouvelle opération légitime).
      await postDoubleEntry({
        fromWalletId: destA.walletId, toWalletId: source.walletId, type: 'REVERSAL',
        amount: 5_000, description: 'itest reconciliation reversal partiel', idempotencyKey: `IT-${tag()}`,
      });

      for (const [walletId, initial] of [
        [source.walletId, 200_000],
        [destA.walletId, 0],
        [destB.walletId, 0],
      ] as const) {
        const entries = await prisma.ledgerEntry.findMany({ where: { walletId } });
        const signedSum = entries.reduce(
          (sum, e) => sum + (e.direction === 'CREDIT' ? Number(e.amount) : -Number(e.amount)),
          0
        );
        const actualBalance = await getWalletBalance(walletId);
        expect(actualBalance).toBe(initial + signedSum); // solde matérialisé == solde recalculé depuis les écritures
      }
    });
  });
});
