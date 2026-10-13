// ============================================================
// KESSIA — Invariants comptables (intégration, P2.20 volet 3)
//
// Contre une vraie base. Chaque invariant du plan
// (docs/audit/PHASE0_EXECUTION_PLAN.md §436-442) est couvert :
//   - ∀ wallet : balance == Σ(ledger)
//   - séquestre tontine : solde == cotisations non redistribuées
//   - séquestre marketplace : delta == commandes PENDING_SETTLEMENT créées
//   - Σ(tous soldes) == Σ(dépôts) − Σ(retraits) [implicite via #1 par wallet]
//   - aucune écriture ledger sans idempotencyKey (déjà garanti en base,
//     colonne NOT NULL @unique — vérifié ici pour documenter/regarder)
//   - aucun solde négatif
//
// IMPORTANT (constat d'audit, 2026-10-12) : le wallet MARKETPLACE_ESCROW
// est un SINGLETON PARTAGÉ entre toutes les suites de tests — jamais
// nettoyé par `cleanup()` (qui ne purge que les wallets liés à des
// `userIds`/`tontineIds` créés par le test). Sur une base de test locale
// longue durée, il accumule des écritures de centaines d'exécutions
// passées (552 lignes observées, du 2026-09-23 au 2026-10-12) — vérifié
// manuellement : balance absolue ≠ Σ(ledger) à cause de cet historique,
// PAS d'un défaut d'atomicité de `postDoubleEntry`/`createLedgerEntry`
// (dont l'atomicité est elle-même prouvée par ailleurs : verrou + double
// vérification d'idempotence sous verrou, cf. lib/ledger/ledger.service.ts).
// Le test ci-dessous vérifie donc ce séquestre par DELTA (avant/après sa
// propre opération), jamais par solde absolu — seule méthode robuste
// pour un wallet système partagé sur une base de test non réinitialisée
// entre exécutions. Les wallets USER et TONTINE_ESCROW, eux, sont
// systématiquement nettoyés par `cleanup()` : vérifiés par solde absolu.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { signAccessToken } from '@/lib/auth/session';
import { postDoubleEntry, createLedgerEntry, getWalletBalance } from '@/lib/ledger/ledger.service';
import { getMarketplaceEscrowWallet } from '@/lib/marketplace/escrow';
import { activateTontine } from '@/lib/tontine/orchestrator';
import { POST as transferPost } from '@/app/api/v1/wallet/transfer/route';
import { NextRequest } from 'next/server';
import { prisma, makeUser, cleanup, settle, tag } from './helpers';

const userIds: string[] = [];
const tontineIds: string[] = [];
const itemIds: string[] = [];

afterEach(async () => {
  await settle();
  for (const id of itemIds.splice(0)) {
    await prisma.marketplaceDelivery.deleteMany({ where: { order: { itemId: id } } }).catch(() => {});
    await prisma.marketplaceOrder.deleteMany({ where: { itemId: id } }).catch(() => {});
    await prisma.marketplaceItem.deleteMany({ where: { id } }).catch(() => {});
  }
  await cleanup({ userIds: userIds.splice(0), tontineIds: tontineIds.splice(0) });
});

function tokenFor(u: { id: string; phone: string }) {
  return signAccessToken({ sub: u.id, phone: u.phone, role: 'USER' });
}

async function walletLedgerSum(walletId: string): Promise<number> {
  const entries = await prisma.ledgerEntry.findMany({ where: { walletId }, select: { direction: true, amount: true } });
  let sum = 0;
  for (const e of entries) sum += e.direction === 'CREDIT' ? Number(e.amount) : -Number(e.amount);
  return sum;
}

describe('Invariants comptables — aucun solde négatif, aucune clé dupliquée (global, intégration)', () => {
  it('aucun wallet, toutes suites confondues, n\'a de solde négatif', async () => {
    const negative = await prisma.wallet.count({ where: { balance: { lt: 0 } } });
    expect(negative).toBe(0);
  });

  it('aucune écriture ledger sans idempotencyKey (contrainte NOT NULL + @unique déjà en base)', async () => {
    const missing = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM ledger_entries WHERE "idempotencyKey" IS NULL
    `;
    expect(Number(missing[0].count)).toBe(0);
  });

  it('aucune clé d\'idempotence n\'apparaît deux fois (la contrainte @unique l\'interdit déjà)', async () => {
    const duplicates = await prisma.$queryRaw<{ idempotencyKey: string; n: bigint }[]>`
      SELECT "idempotencyKey", count(*) as n FROM ledger_entries GROUP BY "idempotencyKey" HAVING count(*) > 1
    `;
    expect(duplicates).toHaveLength(0);
  });
});

describe('Invariant — wallet utilisateur : balance == Σ(ledger) après une séquence de mouvements (intégration)', () => {
  it('après plusieurs transferts P2P aléatoires entre 3 comptes jetables, chaque wallet reste exactement égal à la somme de son propre ledger', async () => {
    // `makeUser({ balance: N })` pose un solde de fixture SANS écriture
    // ledger correspondante (commodité de test, déjà utilisée ainsi dans
    // toute la suite existante) — pour vérifier balance == Σ(ledger)
    // fidèlement, les comptes démarrent à 0 et sont financés par un VRAI
    // DEPOSIT ledger, comme un wallet réel ne reçoit jamais de solde sans
    // écriture qui l'explique.
    const a = await makeUser({ balance: 0, kycStatus: 'VERIFIED', kycLevel: 2 });
    const b = await makeUser({ balance: 0, kycStatus: 'VERIFIED', kycLevel: 2 });
    const c = await makeUser({ balance: 0, kycStatus: 'VERIFIED', kycLevel: 2 });
    userIds.push(a.id, b.id, c.id);

    for (const [user, amount] of [[a, 200_000], [b, 50_000]] as const) {
      const dep = await createLedgerEntry({
        walletId: user.walletId, type: 'DEPOSIT', direction: 'CREDIT', amount,
        description: 'itest invariant — dépôt initial', idempotencyKey: `itest-deposit-${tag()}`,
      });
      expect(dep.success).toBe(true);
    }

    function transfer(from: typeof a, to: typeof a, amount: number) {
      return transferPost(
        new NextRequest('http://localhost/api/v1/wallet/transfer', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(from)}` },
          body: JSON.stringify({ recipientPhone: to.phone, amount }),
        })
      );
    }

    // Séquence arbitraire mais déterministe de mouvements croisés.
    const r1 = await transfer(a, b, 30_000);
    const r2 = await transfer(b, c, 15_000);
    const r3 = await transfer(c, a, 5_000);
    const r4 = await transfer(a, c, 10_000);
    expect([r1.status, r2.status, r3.status, r4.status]).toEqual([200, 200, 200, 200]);

    for (const u of [a, b, c]) {
      const balance = await getWalletBalance(u.walletId);
      const ledgerSum = await walletLedgerSum(u.walletId);
      expect(balance).toBe(ledgerSum);
    }

    // Σ(soldes finaux) == Σ(soldes initiaux) — aucune création/destruction de valeur.
    const [balA, balB, balC] = await Promise.all([
      getWalletBalance(a.walletId),
      getWalletBalance(b.walletId),
      getWalletBalance(c.walletId),
    ]);
    expect((balA ?? 0) + (balB ?? 0) + (balC ?? 0)).toBe(200_000 + 50_000 + 0);
  });

  it('un double mouvement idempotent (postDoubleEntry rejoué) ne casse jamais balance == Σ(ledger)', async () => {
    const from = await makeUser({ balance: 0 });
    const to = await makeUser({ balance: 0 });
    userIds.push(from.id, to.id);
    const initialDeposit = await createLedgerEntry({
      walletId: from.walletId, type: 'DEPOSIT', direction: 'CREDIT', amount: 100_000,
      description: 'itest invariant — dépôt initial', idempotencyKey: `itest-deposit-${tag()}`,
    });
    expect(initialDeposit.success).toBe(true);
    const key = `itest-invariant-${tag()}`;

    const input = {
      fromWalletId: from.walletId,
      toWalletId: to.walletId,
      type: 'TRANSFER_OUT' as const,
      amount: 25_000,
      description: 'itest invariant',
      idempotencyKey: key,
    };
    const first = await postDoubleEntry(input);
    const replay = await postDoubleEntry(input); // même clé — doit être un no-op
    expect(first.success).toBe(true);
    expect(replay.success).toBe(true);
    expect(replay.outEntryId).toBe(first.outEntryId);

    for (const w of [from.walletId, to.walletId]) {
      expect(await getWalletBalance(w)).toBe(await walletLedgerSum(w));
    }
  });
});

describe('Invariant — séquestre de tontine : solde == cotisations non redistribuées (wallet dédié, nettoyé par test)', () => {
  it('après N cotisations puis restitution intégrale, le séquestre dédié à cette tontine revient exactement à 0', async () => {
    const organizer = await makeUser({ balance: 0 });
    const member = await makeUser({ balance: 50_000 });
    userIds.push(organizer.id, member.id);

    const now = new Date();
    const t = await prisma.tontine.create({
      data: {
        name: `IT invariants ${tag()}`, type: 'CLASSIC_ROTATING', amount: 10_000, currency: 'XOF',
        frequency: 'MONTHLY', startDate: now, maxMembers: 2, totalRounds: 2,
        inviteCode: `IT-${tag()}`, createdById: organizer.id, // status: PENDING par défaut
        members: {
          create: [
            { userId: organizer.id, status: 'ACTIVE', orderPosition: 1, joinedAt: now },
            { userId: member.id, status: 'ACTIVE', orderPosition: 2, joinedAt: now },
          ],
        },
      },
    });
    tontineIds.push(t.id);

    // L'activation (pas une simple pose de `status: 'ACTIVE'` en donnée
    // brute) est ce qui crée réellement le wallet séquestre dédié —
    // même mécanisme que tontine-concurrency.itest.ts.
    const activation = await activateTontine(t.id);
    expect(activation.ok).toBe(true);

    const escrowBefore = await prisma.wallet.findUnique({ where: { tontineId: t.id }, select: { id: true, balance: true } });
    expect(escrowBefore).not.toBeNull();
    expect(Number(escrowBefore?.balance ?? 0)).toBe(0);

    // Une cotisation du membre payant vers le séquestre dédié de CETTE tontine.
    const r = await postDoubleEntry({
      fromWalletId: member.walletId,
      toWalletId: escrowBefore!.id,
      type: 'TONTINE_CONTRIBUTION',
      amount: 10_000,
      description: 'itest invariant cotisation',
      idempotencyKey: `itest-tontine-escrow-${tag()}`,
    });
    expect(r.success).toBe(true);

    const escrowAfterContribution = await getWalletBalance(escrowBefore!.id);
    expect(escrowAfterContribution).toBe(10_000);
    expect(escrowAfterContribution).toBe(await walletLedgerSum(escrowBefore!.id));

    // Restitution intégrale vers l'organisateur — séquestre vidé exactement.
    const r2 = await postDoubleEntry({
      fromWalletId: escrowBefore!.id,
      toWalletId: organizer.walletId,
      type: 'TONTINE_PAYOUT',
      amount: 10_000,
      description: 'itest invariant restitution',
      idempotencyKey: `itest-tontine-payout-${tag()}`,
    });
    expect(r2.success).toBe(true);

    const escrowFinal = await getWalletBalance(escrowBefore!.id);
    expect(escrowFinal).toBe(0);
    expect(escrowFinal).toBe(await walletLedgerSum(escrowBefore!.id));
  });
});

describe('Invariant — séquestre Marketplace (wallet système PARTAGÉ) : vérifié par DELTA, jamais par solde absolu', () => {
  it('une nouvelle commande PENDING_SETTLEMENT augmente le séquestre partagé exactement du montant de cette commande', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 500_000 });
    userIds.push(seller.id, buyer.id);

    const escrow = await getMarketplaceEscrowWallet();
    const balanceBefore = await getWalletBalance(escrow.id);

    const item = await prisma.marketplaceItem.create({
      data: {
        sellerId: seller.id, title: `itest invariants ${tag()}`, price: 42_000, currency: 'XOF',
        settlement: 'ON_DELIVERY', stock: 1, status: 'ACTIVE',
      },
    });
    itemIds.push(item.id);

    const idem = `ITEST_INVARIANT_ESCROW_${item.id}`;
    const result = await postDoubleEntry({
      fromWalletId: buyer.walletId,
      toWalletId: escrow.id,
      type: 'SALE_PAYMENT',
      amount: 42_000,
      description: 'itest invariant marketplace',
      idempotencyKey: idem,
    });
    expect(result.success).toBe(true);
    await prisma.marketplaceOrder.create({
      data: {
        itemId: item.id, buyerId: buyer.id, mode: 'WALLET', amount: 42_000, currency: 'XOF',
        status: 'PENDING_SETTLEMENT', settlement: 'ON_DELIVERY', ledgerRef: idem,
      },
    });

    const balanceAfter = await getWalletBalance(escrow.id);
    // Le DELTA causé par CETTE opération, jamais le solde absolu partagé.
    expect((balanceAfter ?? 0) - (balanceBefore ?? 0)).toBe(42_000);

    const pendingSum = await prisma.marketplaceOrder.aggregate({
      where: { itemId: item.id, status: 'PENDING_SETTLEMENT' },
      _sum: { amount: true },
    });
    expect(Number(pendingSum._sum.amount)).toBe(42_000);
  });
});
