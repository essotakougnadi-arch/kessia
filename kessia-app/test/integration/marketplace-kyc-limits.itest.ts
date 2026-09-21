// ============================================================
// KESSIA — Plafonds KYC appliqués à la commande Marketplace (P0.5, §30)
//
// Vérifie contre une vraie base : un achat marketplace (mode WALLET) est
// désormais soumis au même plafond sortant que wallet/transfer/payments —
// un compte non vérifié ne peut plus dépenser sans plafond via la
// marketplace. Vérifie aussi que l'agrégation mensuelle compte bien ces
// achats (sinon le plafond mensuel serait contournable).
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as orderRoute } from '@/app/api/v1/marketplace/[id]/order/route';
import { signAccessToken } from '@/lib/auth/session';
import { checkOutboundLimit } from '@/lib/kyc/limits';
import { getWalletBalance } from '@/lib/ledger/ledger.service';
import prisma from '@/lib/db/prisma';
import { makeUser, cleanup, settle } from './helpers';

const userIds: string[] = [];
const itemIds: string[] = [];

afterEach(async () => {
  await settle();
  for (const id of itemIds.splice(0)) {
    await prisma.marketplaceOrder.deleteMany({ where: { itemId: id } }).catch(() => {});
    await prisma.marketplaceItem.deleteMany({ where: { id } }).catch(() => {});
  }
  await cleanup({ userIds: userIds.splice(0) });
});

async function makeItem(sellerId: string, price: number) {
  const it = await prisma.marketplaceItem.create({
    data: {
      sellerId, title: `itest kyc-limit ${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      price, currency: 'XOF', settlement: 'IMMEDIATE', stock: 10, status: 'ACTIVE',
    },
  });
  itemIds.push(it.id);
  return it;
}

function orderRequest(itemId: string, token: string, body: unknown) {
  return orderRoute(
    new NextRequest(`http://localhost/api/v1/marketplace/${itemId}/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: itemId }) }
  );
}

describe('POST /api/v1/marketplace/[id]/order — plafonds KYC (P0.5)', () => {
  it('un compte non vérifié (palier 0) est refusé au-dessus du plafond par transaction', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 200_000, kycStatus: 'NOT_STARTED' }); // palier 0 : 50 000 / opération
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, 60_000); // > 50 000
    const token = signAccessToken({ sub: buyer.id, phone: buyer.phone, role: 'USER' });

    const res = await orderRequest(item.id, token, { mode: 'WALLET' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(`${body.error ?? body.message ?? ''}`.toLowerCase()).toMatch(/plafond/);
    expect(await getWalletBalance(buyer.walletId)).toBe(200_000); // aucun débit
    expect(await prisma.marketplaceOrder.count({ where: { itemId: item.id } })).toBe(0);
  });

  it('un compte vérifié niveau 2 peut acheter un article que le palier 0 refuserait', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 500_000, kycStatus: 'VERIFIED', kycLevel: 2 });
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, 300_000); // > plafond palier 0, OK au palier 2
    const token = signAccessToken({ sub: buyer.id, phone: buyer.phone, role: 'USER' });

    const res = await orderRequest(item.id, token, { mode: 'WALLET' });
    expect(res.status).toBe(201);
    expect(await getWalletBalance(buyer.walletId)).toBe(200_000);
  });

  it('les achats marketplace sont comptés dans l’agrégation mensuelle (pas de contournement par petits achats répétés)', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 500_000, kycStatus: 'NOT_STARTED' }); // palier 0 : 150 000 / mois
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, 40_000); // < plafond par opération (50 000)
    const token = signAccessToken({ sub: buyer.id, phone: buyer.phone, role: 'USER' });

    // 3 achats de 40 000 = 120 000, encore sous le plafond mensuel (150 000).
    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line no-await-in-loop
      const r = await orderRequest(item.id, token, { mode: 'WALLET' });
      expect(r.status).toBe(201);
    }

    // Vérifie que l'agrégation reflète bien ces 3 achats (SALE_PAYMENT compté).
    const check = await checkOutboundLimit(buyer.id, 1);
    expect(check.usedThisMonth).toBe(120_000);

    // Le 4e achat (encore 40 000) ferait dépasser 150 000 → refusé.
    const r4 = await orderRequest(item.id, token, { mode: 'WALLET' });
    expect(r4.status).toBe(400);
    const body4 = (await r4.json()) as { error?: string; message?: string };
    expect(`${body4.error ?? body4.message ?? ''}`.toLowerCase()).toMatch(/mensuel/);

    expect(await getWalletBalance(buyer.walletId)).toBe(500_000 - 120_000); // pas de 4e débit
    expect(await prisma.marketplaceOrder.count({ where: { itemId: item.id } })).toBe(3);
  });
});
