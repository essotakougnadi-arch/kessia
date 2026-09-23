// ============================================================
// KESSIA — Séquestre marketplace « paiement à la réception » (ADR 0045)
//
// Vérifie contre une vraie base : achat ON_DELIVERY → fonds au
// séquestre plateforme ; libération vers le vendeur à la confirmation
// (idempotente) ; remboursement de l'acheteur si la livraison échoue.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import prisma from '@/lib/db/prisma';
import { postDoubleEntry } from '@/lib/ledger/ledger.service';
import {
  getMarketplaceEscrowWallet,
  releaseEscrowToSeller,
  refundEscrowToBuyer,
} from '@/lib/marketplace/escrow';
import { confirmDelivered } from '@/lib/delivery';
import { makeUser, cleanup, settle } from './helpers';

const userIds: string[] = [];
const itemIds: string[] = [];

afterEach(async () => {
  await settle();
  for (const id of itemIds.splice(0)) {
    await prisma.marketplaceDelivery.deleteMany({ where: { order: { itemId: id } } }).catch(() => {});
    await prisma.marketplaceOrder.deleteMany({ where: { itemId: id } }).catch(() => {});
    await prisma.marketplaceItem.deleteMany({ where: { id } }).catch(() => {});
  }
  // Les écritures séquestre restent (ledger immuable) — on les nettoie.
  const escrow = await prisma.wallet.findFirst({ where: { kind: 'MARKETPLACE_ESCROW' }, select: { id: true } });
  if (escrow) await prisma.ledgerEntry.deleteMany({ where: { walletId: escrow.id, referenceId: { in: userIds } } }).catch(() => {});
  await cleanup({ userIds: userIds.splice(0) });
});

async function makeItem(sellerId: string, price: number) {
  const it = await prisma.marketplaceItem.create({
    data: {
      sellerId, title: `itest séquestre ${Date.now()}`, price, currency: 'XOF',
      settlement: 'ON_DELIVERY', stock: 1, status: 'ACTIVE',
    },
  });
  itemIds.push(it.id);
  return it;
}

/** Simule l'achat WALLET d'un article ON_DELIVERY : buyer → séquestre. */
async function buyOnDelivery(buyer: { id: string; walletId: string }, item: { id: string; price: unknown }) {
  const escrow = await getMarketplaceEscrowWallet();
  const price = Number(item.price);
  const idem = `ITEST_MKT_${item.id}_${Date.now()}`;
  const led = await postDoubleEntry({
    fromWalletId: buyer.walletId,
    toWalletId: escrow.id,
    type: 'SALE_PAYMENT',
    amount: price,
    description: 'itest achat séquestre',
    referenceId: buyer.id,
    idempotencyKey: idem,
  });
  expect(led.success).toBe(true);
  const order = await prisma.marketplaceOrder.create({
    data: {
      itemId: item.id, buyerId: buyer.id, mode: 'WALLET', amount: price, currency: 'XOF',
      status: 'PENDING_SETTLEMENT', settlement: 'ON_DELIVERY', ledgerRef: idem,
    },
  });
  await prisma.marketplaceItem.update({ where: { id: item.id }, data: { stock: { decrement: 1 } } });
  return order;
}

describe('Séquestre marketplace (intégration)', () => {
  it('libère les fonds vers le vendeur à la confirmation, de façon idempotente', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 300_000 });
    userIds.push(seller.id, buyer.id);

    const item = await makeItem(seller.id, 200_000);
    const order = await buyOnDelivery(buyer, item);

    // Les fonds ne sont PAS chez le vendeur.
    let sellerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: seller.id } });
    expect(Number(sellerWallet.balance)).toBe(0);

    const r1 = await releaseEscrowToSeller(order.id, 'buyer_confirmed');
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.settled).toBe(200_000);

    sellerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: seller.id } });
    expect(Number(sellerWallet.balance)).toBe(200_000);

    const after = await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe('PAID');
    expect(after.settledAt).not.toBeNull();

    // Idempotence : deuxième appel = pas de double versement.
    const r2 = await releaseEscrowToSeller(order.id, 'buyer_confirmed');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.alreadySettled).toBe(true);
    sellerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: seller.id } });
    expect(Number(sellerWallet.balance)).toBe(200_000);
  });

  it('rembourse l’acheteur si la livraison échoue et remet l’article en vente', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 300_000 });
    userIds.push(seller.id, buyer.id);

    const item = await makeItem(seller.id, 150_000);
    const order = await buyOnDelivery(buyer, item);

    let buyerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: buyer.id } });
    expect(Number(buyerWallet.balance)).toBe(150_000); // 300k - 150k au séquestre

    const r = await refundEscrowToBuyer(order.id, 'delivery_cancelled');
    expect(r.ok).toBe(true);

    buyerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: buyer.id } });
    expect(Number(buyerWallet.balance)).toBe(300_000);

    const after = await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe('REFUNDED');
    const itemAfter = await prisma.marketplaceItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(itemAfter.stock).toBe(1);
    expect(itemAfter.status).toBe('ACTIVE');

    // Après remboursement, on ne peut plus régler le vendeur.
    const late = await releaseEscrowToSeller(order.id, 'auto_release');
    expect(late.ok).toBe(false);
  });

  it('vingt appels VRAIMENT concurrents à refundEscrowToBuyer (même commande) : un seul remboursement réel, tous propres (P1.6, Étape 8)', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 300_000 });
    userIds.push(seller.id, buyer.id);

    const item = await makeItem(seller.id, 90_000);
    const order = await buyOnDelivery(buyer, item);

    const results = await Promise.all(
      Array.from({ length: 20 }, () => refundEscrowToBuyer(order.id, 'delivery_cancelled'))
    );
    expect(results.every((r) => r.ok)).toBe(true); // correctif P1.6 : plus de faux "Solde insuffisant"

    const idem = `MKT_ESCROW_REFUND_${order.id}`;
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: `${idem}:out` } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: `${idem}:in` } })).toBe(1);

    const buyerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: buyer.id } });
    expect(Number(buyerWallet.balance)).toBe(300_000); // remboursé UNE fois, pas 20 fois

    const after = await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe('REFUNDED');
  });

  it('vingt postDoubleEntry(REVERSAL) VRAIMENT concurrents, même clé, solde source EXACTEMENT égal au montant : tous propres (P1.6, Étape 8)', async () => {
    const source = await makeUser({ balance: 45_000 });
    const dest = await makeUser({ balance: 0 });
    userIds.push(source.id, dest.id);
    const key = `ITEST_REVERSAL_${Date.now()}`;

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        postDoubleEntry({
          fromWalletId: source.walletId, toWalletId: dest.walletId, type: 'REVERSAL',
          amount: 45_000, description: 'itest reversal P1.6', idempotencyKey: key,
        })
      )
    );
    expect(results.every((r) => r.success)).toBe(true);
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: `${key}:out` } })).toBe(1);
    expect(await prisma.wallet.findUniqueOrThrow({ where: { userId: dest.id } }).then((w) => Number(w.balance)))
      .toBe(45_000);
    expect(await prisma.wallet.findUniqueOrThrow({ where: { userId: source.id } }).then((w) => Number(w.balance)))
      .toBe(0);
  });

  it('vingt appels VRAIMENT concurrents à releaseEscrowToSeller (même commande) : un seul versement réel, tous propres (P1.6, correctif Ledger validé au niveau Marketplace)', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 300_000 });
    userIds.push(seller.id, buyer.id);

    const item = await makeItem(seller.id, 120_000);
    const order = await buyOnDelivery(buyer, item);

    const results = await Promise.all(
      Array.from({ length: 20 }, () => releaseEscrowToSeller(order.id, 'buyer_confirmed'))
    );

    // Avant P1.6 (constaté en P0.4) : certains appels échouaient en
    // "Solde insuffisant" — `postDoubleEntry` (Ledger core) vérifiait le
    // solde avant de retenter la résolution idempotente. Corrigé en P1.6
    // (revérification de l'idempotence sous verrou, avant tout calcul de
    // solde). Revalidé ici au niveau Marketplace : tous les appels
    // doivent désormais réussir proprement.
    expect(results.every((r) => r.ok)).toBe(true);

    const idem = `MKT_SETTLE_${order.id}`;
    const outCount = await prisma.ledgerEntry.count({ where: { idempotencyKey: `${idem}:out` } });
    const inCount = await prisma.ledgerEntry.count({ where: { idempotencyKey: `${idem}:in` } });
    expect(outCount).toBe(1); // une seule écriture débit réelle, quel que soit le nombre d'appels
    expect(inCount).toBe(1); // une seule écriture crédit réelle

    const sellerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: seller.id } });
    expect(Number(sellerWallet.balance)).toBe(120_000); // pas 2 400 000 : jamais de double versement

    const after = await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe('PAID');
  });

  it('double-clic « j’ai reçu mon colis » : vingt appels concurrents à confirmDelivered → une seule libération, un seul versement (P0.4 finalisation)', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 300_000 });
    userIds.push(seller.id, buyer.id);

    const item = await makeItem(seller.id, 90_000);
    const order = await buyOnDelivery(buyer, item);
    const delivery = await prisma.marketplaceDelivery.create({
      data: {
        orderId: order.id, buyerId: buyer.id, mode: 'SIMULATED', status: 'IN_TRANSIT',
        pickupLabel: 'Vendeur itest', dropoffAddress: 'Zone itest', dropoffArea: 'Lomé',
        recipientPhone: buyer.phone, feeAmount: 0,
      },
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => confirmDelivered(delivery.id, buyer.id))
    );
    expect(results.every((r) => r.ok)).toBe(true); // jamais d'échec/500 pour un double-clic légitime

    const sellerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: seller.id } });
    expect(Number(sellerWallet.balance)).toBe(90_000); // un seul versement, pas 1 800 000

    const after = await prisma.marketplaceDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(after.status).toBe('DELIVERED');
    const orderAfter = await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfter.status).toBe('PAID');
  });
});
