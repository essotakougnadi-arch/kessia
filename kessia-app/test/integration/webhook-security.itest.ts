// ============================================================
// KESSIA — Sécurité des webhooks entrants (intégration, P0.3)
//
// Vérifie contre une vraie base : signature absente/invalide/expirée
// → rejet ; signature valide → traité ; rejeu du même événement signé
// → idempotence stricte (aucun double effet) ; fail-closed en
// production sans secret configuré.
// ============================================================

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as paymentWebhook } from '@/app/api/v1/payments/webhooks/[provider]/route';
import { POST as miarideWebhook } from '@/app/api/v1/marketplace/deliveries/webhooks/miaride/route';
import { signWebhookPayload } from '@/lib/webhooks/verify';
import { getMarketplaceEscrowWallet } from '@/lib/marketplace/escrow';
import { postDoubleEntry, getWalletBalance } from '@/lib/ledger/ledger.service';
import prisma from '@/lib/db/prisma';
import { makeUser, cleanup, settle } from './helpers';

const PAY_SECRET = 'itest-payment-secret';
const MIA_SECRET = 'itest-miaride-secret';

beforeEach(() => {
  process.env.PAYMENT_WEBHOOK_SECRET = PAY_SECRET;
  process.env.MIARIDE_WEBHOOK_SECRET = MIA_SECRET;
});

afterEach(() => {
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  delete process.env.MIARIDE_WEBHOOK_SECRET;
  vi.unstubAllEnvs();
});

function webhookRequest(url: string, rawBody: string, headerName: string, signature: string | null) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { [headerName]: signature } : {}),
    },
    body: rawBody,
  });
}

async function eventCount(eventKey: string) {
  return prisma.webhookEvent.count({ where: { eventKey } });
}

const userIds: string[] = [];
const itemIds: string[] = [];

afterEach(async () => {
  await settle();
  // Livraisons/commandes/articles d'abord (FK vers User), puis les
  // utilisateurs — même ordre que marketplace-settlement.itest.ts.
  for (const id of itemIds.splice(0)) {
    await prisma.marketplaceDelivery.deleteMany({ where: { order: { itemId: id } } }).catch(() => {});
    await prisma.marketplaceOrder.deleteMany({ where: { itemId: id } }).catch(() => {});
    await prisma.marketplaceItem.deleteMany({ where: { id } }).catch(() => {});
  }
  await cleanup({ userIds: userIds.splice(0) });
});

// ---- Webhook paiement --------------------------------------

async function pendingDeposit(userId: string, walletId: string, amount: number) {
  return prisma.paymentTransaction.create({
    data: {
      userId, walletId,
      provider: 'simulator', method: 'MOBILE_MONEY', direction: 'INBOUND',
      amount, currency: 'XOF', status: 'PENDING', simulated: true,
    },
  });
}

describe('POST /api/v1/payments/webhooks/[provider] (intégration, P0.3)', () => {
  const url = 'http://localhost/api/v1/payments/webhooks/simulator';
  const params = Promise.resolve({ provider: 'simulator' });

  it('signature absente → 401, aucun crédit', async () => {
    const u = await makeUser({ balance: 0 });
    userIds.push(u.id);
    const tx = await pendingDeposit(u.id, u.walletId, 10_000);
    const body = JSON.stringify({ event: 'payment.completed', reference: tx.id });

    const res = await paymentWebhook(webhookRequest(url, body, 'x-kessia-signature', null), { params });
    expect(res.status).toBe(401);
    expect(await getWalletBalance(u.walletId)).toBe(0);
  });

  it('signature invalide (mauvais secret) → 401', async () => {
    const u = await makeUser({ balance: 0 });
    userIds.push(u.id);
    const tx = await pendingDeposit(u.id, u.walletId, 10_000);
    const body = JSON.stringify({ event: 'payment.completed', reference: tx.id });
    const sig = signWebhookPayload(body, 'un-mauvais-secret');

    const res = await paymentWebhook(webhookRequest(url, body, 'x-kessia-signature', sig), { params });
    expect(res.status).toBe(401);
    expect(await getWalletBalance(u.walletId)).toBe(0);
  });

  it('signature valide mais expirée (hors fenêtre anti-rejeu) → 401', async () => {
    const u = await makeUser({ balance: 0 });
    userIds.push(u.id);
    const tx = await pendingDeposit(u.id, u.walletId, 10_000);
    const body = JSON.stringify({ event: 'payment.completed', reference: tx.id });
    const sig = signWebhookPayload(body, PAY_SECRET, Date.now() - 10 * 60_000);

    const res = await paymentWebhook(webhookRequest(url, body, 'x-kessia-signature', sig), { params });
    expect(res.status).toBe(401);
    expect(await getWalletBalance(u.walletId)).toBe(0);
  });

  it('signature valide → 200, wallet crédité, WebhookEvent vérifié + traité', async () => {
    const u = await makeUser({ balance: 0 });
    userIds.push(u.id);
    const tx = await pendingDeposit(u.id, u.walletId, 15_000);
    const body = JSON.stringify({ event: 'payment.completed', reference: tx.id });
    const sig = signWebhookPayload(body, PAY_SECRET);

    const res = await paymentWebhook(webhookRequest(url, body, 'x-kessia-signature', sig), { params });
    expect(res.status).toBe(200);
    expect(await getWalletBalance(u.walletId)).toBe(15_000);

    const eventKey = `payment:simulator:payment.completed:${tx.id}`;
    const event = await prisma.webhookEvent.findUnique({ where: { eventKey } });
    expect(event?.verified).toBe(true);
    expect(event?.status).toBe('processed');
  });

  it('rejeu du même événement signé → idempotent, aucun double crédit', async () => {
    const u = await makeUser({ balance: 0 });
    userIds.push(u.id);
    const tx = await pendingDeposit(u.id, u.walletId, 20_000);
    const body = JSON.stringify({ event: 'payment.completed', reference: tx.id });
    const sig = signWebhookPayload(body, PAY_SECRET);
    const eventKey = `payment:simulator:payment.completed:${tx.id}`;

    const first = await paymentWebhook(webhookRequest(url, body, 'x-kessia-signature', sig), { params });
    expect(first.status).toBe(200);

    // Rejeu — nouvelle signature (nouvel horodatage), même événement métier.
    const replaySig = signWebhookPayload(body, PAY_SECRET);
    const second = await paymentWebhook(webhookRequest(url, body, 'x-kessia-signature', replaySig), { params });
    expect(second.status).toBe(200);
    const secondJson = (await second.json()) as { data: { duplicate?: boolean } };
    expect(secondJson.data.duplicate).toBe(true);

    expect(await getWalletBalance(u.walletId)).toBe(20_000); // pas 40 000
    expect(await eventCount(eventKey)).toBe(1); // une seule ligne journal
  });

  it('sans secret configuré, en production → 401 (fail-closed)', async () => {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    vi.stubEnv('NODE_ENV', 'production');
    const u = await makeUser({ balance: 0 });
    userIds.push(u.id);
    const tx = await pendingDeposit(u.id, u.walletId, 10_000);
    const body = JSON.stringify({ event: 'payment.completed', reference: tx.id });

    const res = await paymentWebhook(webhookRequest(url, body, 'x-kessia-signature', null), { params });
    expect(res.status).toBe(401);
    expect(await getWalletBalance(u.walletId)).toBe(0);
  });
});

// ---- Webhook Miaride (livraison) ----------------------------

async function makeDeliveryFixture(reference: string) {
  const seller = await makeUser({ balance: 0 });
  const buyer = await makeUser({ balance: 300_000 });
  userIds.push(seller.id, buyer.id);

  const item = await prisma.marketplaceItem.create({
    data: {
      sellerId: seller.id, title: `itest webhook ${Date.now()}`, price: 100_000, currency: 'XOF',
      settlement: 'ON_DELIVERY', stock: 1, status: 'ACTIVE',
    },
  });
  itemIds.push(item.id);

  const escrow = await getMarketplaceEscrowWallet();
  const idem = `ITEST_WEBHOOK_${item.id}`;
  await postDoubleEntry({
    fromWalletId: buyer.walletId, toWalletId: escrow.id, type: 'SALE_PAYMENT',
    amount: 100_000, description: 'itest webhook', referenceId: buyer.id, idempotencyKey: idem,
  });
  const order = await prisma.marketplaceOrder.create({
    data: {
      itemId: item.id, buyerId: buyer.id, mode: 'WALLET', amount: 100_000, currency: 'XOF',
      status: 'PENDING_SETTLEMENT', settlement: 'ON_DELIVERY', ledgerRef: idem,
    },
  });
  const delivery = await prisma.marketplaceDelivery.create({
    data: {
      orderId: order.id, buyerId: buyer.id, mode: 'SIMULATED', status: 'REQUESTED',
      pickupLabel: 'Vendeur itest', dropoffAddress: 'Zone itest', dropoffArea: 'Lomé',
      recipientPhone: buyer.phone, feeAmount: 0, providerRef: reference,
    },
  });
  return { seller, buyer, item, order, delivery };
}

describe('POST /api/v1/marketplace/deliveries/webhooks/miaride (intégration, P0.3)', () => {
  const url = 'http://localhost/api/v1/marketplace/deliveries/webhooks/miaride';

  it('signature invalide → 401, statut inchangé', async () => {
    const reference = `MIA-${Date.now()}`;
    const { delivery } = await makeDeliveryFixture(reference);
    const body = JSON.stringify({ event: 'delivery.status', reference, status: 'delivered' });
    const sig = signWebhookPayload(body, 'mauvais-secret');

    const res = await miarideWebhook(webhookRequest(url, body, 'x-miaride-signature', sig));
    expect(res.status).toBe(401);
    const after = await prisma.marketplaceDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(after.status).toBe('REQUESTED');
  });

  it('signature valide, statut « delivered » → libère le séquestre vers le vendeur', async () => {
    const reference = `MIA-${Date.now()}-A`;
    const { seller, delivery } = await makeDeliveryFixture(reference);
    const body = JSON.stringify({ event: 'delivery.status', reference, status: 'delivered' });
    const sig = signWebhookPayload(body, MIA_SECRET);

    const res = await miarideWebhook(webhookRequest(url, body, 'x-miaride-signature', sig));
    expect(res.status).toBe(200);

    const after = await prisma.marketplaceDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(after.status).toBe('DELIVERED');

    const sellerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: seller.id } });
    expect(Number(sellerWallet.balance)).toBe(100_000);
  });

  it('rejeu du même événement (référence + statut) → idempotent, pas de double libération', async () => {
    const reference = `MIA-${Date.now()}-B`;
    const { seller, delivery } = await makeDeliveryFixture(reference);
    const body = JSON.stringify({ event: 'delivery.status', reference, status: 'delivered' });
    const eventKey = `miaride:${reference}:DELIVERED`;

    const first = await miarideWebhook(webhookRequest(url, body, 'x-miaride-signature', signWebhookPayload(body, MIA_SECRET)));
    expect(first.status).toBe(200);

    const second = await miarideWebhook(webhookRequest(url, body, 'x-miaride-signature', signWebhookPayload(body, MIA_SECRET)));
    expect(second.status).toBe(200);
    const secondJson = (await second.json()) as { data: { duplicate?: boolean } };
    expect(secondJson.data.duplicate).toBe(true);

    const sellerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: seller.id } });
    expect(Number(sellerWallet.balance)).toBe(100_000); // pas 200 000

    const after = await prisma.marketplaceDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(after.status).toBe('DELIVERED');
    expect(await eventCount(eventKey)).toBe(1);
  });
});
