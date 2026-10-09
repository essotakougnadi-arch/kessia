// ============================================================
// KESSIA — Création d'annonce Marketplace (intégration)
//
// Comble une lacune de couverture identifiée lors de la préparation
// du vendeur officiel KESSIA Shop : aucun test existant n'exerçait
// jusqu'ici POST /api/v1/marketplace (création) — seuls l'achat, le
// règlement et l'idempotence des commandes étaient couverts, toujours
// contre un article créé directement via prisma.marketplaceItem.create.
//
// Vérifie contre une vraie base (USE_TEST_DB=1 obligatoire — voir
// test/integration/env-setup.ts) : création valide, rejet d'un titre
// invalide, rejet d'un prix invalide, puis visibilité de l'annonce
// dans le catalogue public ET dans l'espace vendeur (/mine).
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createItemRoute } from '@/app/api/v1/marketplace/route';
import { GET as marketplaceListRoute } from '@/app/api/v1/marketplace/route';
import { GET as mineRoute } from '@/app/api/v1/marketplace/mine/route';
import { signAccessToken } from '@/lib/auth/session';
import { makeUser, cleanup, prisma } from './helpers';

const userIds: string[] = [];
const itemIds: string[] = [];

afterEach(async () => {
  for (const id of itemIds.splice(0)) {
    await prisma.marketplaceItem.deleteMany({ where: { id } }).catch(() => {});
  }
  await cleanup({ userIds: userIds.splice(0) });
});

function createRequest(token: string, body: unknown) {
  return createItemRoute(
    new NextRequest('http://localhost/api/v1/marketplace', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  );
}

function listRequest(query: string) {
  return marketplaceListRoute(new NextRequest(`http://localhost/api/v1/marketplace?${query}`));
}

function mineRequest(token: string) {
  return mineRoute(
    new NextRequest('http://localhost/api/v1/marketplace/mine', {
      headers: { authorization: `Bearer ${token}` },
    })
  );
}

describe('POST /api/v1/marketplace — création d’annonce', () => {
  it('crée une annonce valide (201), visible dans le catalogue public et dans /mine', async () => {
    const seller = await makeUser();
    userIds.push(seller.id);
    const token = signAccessToken({ sub: seller.id, phone: seller.phone, role: 'USER' });
    const title = `itest article ${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const res = await createRequest(token, { title, price: 12_000 });
    expect(res.status).toBe(201);
    const created = (await res.json()).data as { id: string };
    expect(created.id).toBeTruthy();
    itemIds.push(created.id);

    // Visibilité — catalogue public.
    const listRes = await listRequest(`q=${encodeURIComponent(title)}`);
    const listBody = await listRes.json();
    expect(listBody.data.items.some((it: { id: string }) => it.id === created.id)).toBe(true);

    // Visibilité — espace vendeur (/mine).
    const mineRes = await mineRequest(token);
    const mineBody = await mineRes.json();
    expect(mineBody.data.items.some((it: { id: string }) => it.id === created.id)).toBe(true);
  });

  it('rejette un titre invalide (< 3 caractères) : 400, aucune annonce créée', async () => {
    const seller = await makeUser();
    userIds.push(seller.id);
    const token = signAccessToken({ sub: seller.id, phone: seller.phone, role: 'USER' });

    const res = await createRequest(token, { title: 'ab', price: 12_000 });
    expect(res.status).toBe(400);

    const count = await prisma.marketplaceItem.count({ where: { sellerId: seller.id } });
    expect(count).toBe(0);
  });

  it('rejette un prix invalide (<= 0) : 400, aucune annonce créée', async () => {
    const seller = await makeUser();
    userIds.push(seller.id);
    const token = signAccessToken({ sub: seller.id, phone: seller.phone, role: 'USER' });
    const title = `itest prix invalide ${Date.now()}`;

    const res = await createRequest(token, { title, price: 0 });
    expect(res.status).toBe(400);

    const count = await prisma.marketplaceItem.count({ where: { sellerId: seller.id } });
    expect(count).toBe(0);
  });
});
