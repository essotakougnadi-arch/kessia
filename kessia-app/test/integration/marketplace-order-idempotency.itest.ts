// ============================================================
// KESSIA — Idempotence des commandes Marketplace (intégration, P0.4)
//
// Vérifie contre une vraie base : rejeu exact (même Idempotency-Key) →
// aucun double débit/double commande ; requêtes VRAIMENT concurrentes
// (Promise.all) avec la même clé → une seule commande, un seul débit ;
// deux acheteurs concurrents du dernier exemplaire → un seul réussit,
// l'autre est remboursé, jamais de stock négatif ; mode TONTINE →
// idempotence, pas de tontine dupliquée.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as orderRoute } from '@/app/api/v1/marketplace/[id]/order/route';
import { signAccessToken } from '@/lib/auth/session';
import { getWalletBalance } from '@/lib/ledger/ledger.service';
import prisma from '@/lib/db/prisma';
import { makeUser, cleanup, settle } from './helpers';

const userIds: string[] = [];
const itemIds: string[] = [];
const tontineIds: string[] = [];

afterEach(async () => {
  await settle();
  for (const id of itemIds.splice(0)) {
    await prisma.marketplaceDelivery.deleteMany({ where: { order: { itemId: id } } }).catch(() => {});
    await prisma.marketplaceOrder.deleteMany({ where: { itemId: id } }).catch(() => {});
    await prisma.marketplaceItem.deleteMany({ where: { id } }).catch(() => {});
  }
  await cleanup({ userIds: userIds.splice(0), tontineIds: tontineIds.splice(0) });
});

async function makeItem(
  sellerId: string,
  opts?: { price?: number; stock?: number; settlement?: 'IMMEDIATE' | 'ON_DELIVERY'; payableByTontine?: boolean }
) {
  const it = await prisma.marketplaceItem.create({
    data: {
      sellerId, title: `itest order ${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      price: opts?.price ?? 50_000, currency: 'XOF',
      settlement: opts?.settlement ?? 'IMMEDIATE', stock: opts?.stock ?? 1, status: 'ACTIVE',
      payableByTontine: opts?.payableByTontine ?? false,
    },
  });
  itemIds.push(it.id);
  return it;
}

function orderRequest(itemId: string, token: string, body: unknown, idempotencyKey?: string) {
  return orderRoute(
    new NextRequest(`http://localhost/api/v1/marketplace/${itemId}/order`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: itemId }) }
  );
}

describe('POST /api/v1/marketplace/[id]/order — idempotence WALLET (P0.4)', () => {
  it('rejeu séquentiel avec la même Idempotency-Key : une seule commande, un seul débit', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 100_000 });
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, { price: 30_000, stock: 5 });
    const token = signAccessToken({ sub: buyer.id, phone: buyer.phone, role: 'USER' });
    const key = crypto.randomUUID();

    const r1 = await orderRequest(item.id, token, { mode: 'WALLET' }, key);
    expect(r1.status).toBe(201);
    const b1 = (await r1.json()) as { data: { orderId: string } };

    const r2 = await orderRequest(item.id, token, { mode: 'WALLET' }, key);
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { data: { orderId: string; duplicate?: boolean } };
    expect(b2.data.orderId).toBe(b1.data.orderId);
    expect(b2.data.duplicate).toBe(true);

    expect(await getWalletBalance(buyer.walletId)).toBe(70_000); // débité UNE fois
    const after = await prisma.marketplaceItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.stock).toBe(4); // décrémenté UNE fois
    expect(await prisma.marketplaceOrder.count({ where: { itemId: item.id } })).toBe(1);
  });

  it('deux requêtes VRAIMENT concurrentes avec la même clé : une seule commande créée', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 100_000 });
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, { price: 20_000, stock: 5 });
    const token = signAccessToken({ sub: buyer.id, phone: buyer.phone, role: 'USER' });
    const key = crypto.randomUUID();

    const [r1, r2] = await Promise.all([
      orderRequest(item.id, token, { mode: 'WALLET' }, key),
      orderRequest(item.id, token, { mode: 'WALLET' }, key),
    ]);
    const statuses = [r1.status, r2.status].sort();
    // L'une crée (201), l'autre détecte le doublon (200) — jamais deux 201.
    expect(statuses).toEqual([200, 201]);

    expect(await getWalletBalance(buyer.walletId)).toBe(80_000); // un seul débit
    const after = await prisma.marketplaceItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.stock).toBe(4); // une seule décrémentation
    expect(await prisma.marketplaceOrder.count({ where: { itemId: item.id } })).toBe(1);
  });

  it('sans Idempotency-Key, deux appels distincts créent bien deux commandes séparées (pas de sur-blocage)', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 100_000 });
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, { price: 10_000, stock: 5 });
    const token = signAccessToken({ sub: buyer.id, phone: buyer.phone, role: 'USER' });

    const r1 = await orderRequest(item.id, token, { mode: 'WALLET' });
    const r2 = await orderRequest(item.id, token, { mode: 'WALLET' });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);

    expect(await getWalletBalance(buyer.walletId)).toBe(80_000); // deux achats distincts
    expect(await prisma.marketplaceOrder.count({ where: { itemId: item.id } })).toBe(2);
  });

  it('deux acheteurs concurrents du dernier exemplaire : un seul réussit, l’autre est remboursé, stock jamais négatif', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyerA = await makeUser({ balance: 100_000 });
    const buyerB = await makeUser({ balance: 100_000 });
    userIds.push(seller.id, buyerA.id, buyerB.id);
    const item = await makeItem(seller.id, { price: 25_000, stock: 1 }); // dernier exemplaire
    const tokenA = signAccessToken({ sub: buyerA.id, phone: buyerA.phone, role: 'USER' });
    const tokenB = signAccessToken({ sub: buyerB.id, phone: buyerB.phone, role: 'USER' });

    const [rA, rB] = await Promise.all([
      orderRequest(item.id, tokenA, { mode: 'WALLET' }, crypto.randomUUID()),
      orderRequest(item.id, tokenB, { mode: 'WALLET' }, crypto.randomUUID()),
    ]);

    const results = [rA, rB];
    const succeeded = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status !== 201);
    expect(succeeded.length).toBe(1);
    expect(rejected.length).toBe(1);
    // Le perdant reçoit un 409 (conflit), pas un 401/500 — remboursé, pas juste rejeté.
    expect(rejected[0].status).toBe(409);

    const after = await prisma.marketplaceItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.stock).toBe(0); // jamais négatif
    expect(after.status).toBe('SOLD_OUT');
    expect(await prisma.marketplaceOrder.count({ where: { itemId: item.id } })).toBe(1);

    // Le perdant a été intégralement remboursé — son solde est intact.
    const balances = await Promise.all([getWalletBalance(buyerA.walletId), getWalletBalance(buyerB.walletId)]);
    const spent = balances.filter((b) => b === 75_000);
    const untouched = balances.filter((b) => b === 100_000);
    expect(spent.length).toBe(1);
    expect(untouched.length).toBe(1);
  });

  it('rejeu après un premier essai échoué (solde insuffisant) : la même clé fonctionne une fois le solde suffisant', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 1_000 }); // insuffisant au départ
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, { price: 30_000, stock: 3 });
    const token = signAccessToken({ sub: buyer.id, phone: buyer.phone, role: 'USER' });
    const key = crypto.randomUUID();

    const r1 = await orderRequest(item.id, token, { mode: 'WALLET' }, key);
    expect(r1.status).toBe(400); // solde insuffisant, rien créé

    // L'acheteur recharge son wallet (simulation directe) puis retente avec la MÊME clé.
    await prisma.wallet.update({ where: { id: buyer.walletId }, data: { balance: 50_000 } });
    const r2 = await orderRequest(item.id, token, { mode: 'WALLET' }, key);
    expect(r2.status).toBe(201);
    expect(await prisma.marketplaceOrder.count({ where: { itemId: item.id } })).toBe(1);
  });
});

describe('POST /api/v1/marketplace/[id]/order — idempotence TONTINE (P0.4)', () => {
  it('rejeu avec la même Idempotency-Key : une seule tontine, une seule commande', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 0 }); // TONTINE ne débite pas synchrone
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, { price: 60_000, stock: 3, payableByTontine: true });
    const token = signAccessToken({ sub: buyer.id, phone: buyer.phone, role: 'USER' });
    const key = crypto.randomUUID();
    const body = { mode: 'TONTINE', installments: 6 };

    const r1 = await orderRequest(item.id, token, body, key);
    expect(r1.status).toBe(201);
    const b1 = (await r1.json()) as { data: { tontineId: string } };
    tontineIds.push(b1.data.tontineId);

    const r2 = await orderRequest(item.id, token, body, key);
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { data: { tontineId: string; duplicate?: boolean } };
    expect(b2.data.tontineId).toBe(b1.data.tontineId);
    expect(b2.data.duplicate).toBe(true);

    expect(await prisma.marketplaceOrder.count({ where: { itemId: item.id, mode: 'TONTINE' } })).toBe(1);
    expect(await prisma.tontine.count({ where: { purchaseItem: item.title } })).toBe(1);
  });

  it('deux requêtes concurrentes avec la même clé : aucune tontine orpheline', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 0 });
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, { price: 60_000, stock: 3, payableByTontine: true });
    const token = signAccessToken({ sub: buyer.id, phone: buyer.phone, role: 'USER' });
    const key = crypto.randomUUID();
    const body = { mode: 'TONTINE', installments: 6 };

    const [cA, cB] = await Promise.all([
      orderRequest(item.id, token, body, key),
      orderRequest(item.id, token, body, key),
    ]);
    const winner = cA.status === 201 ? cA : cB;
    const wb = (await winner.json()) as { data: { tontineId: string } };
    tontineIds.push(wb.data.tontineId);

    expect(await prisma.marketplaceOrder.count({ where: { itemId: item.id, mode: 'TONTINE' } })).toBe(1);
    expect(await prisma.tontine.count({ where: { purchaseItem: item.title } })).toBe(1);
  });
});
