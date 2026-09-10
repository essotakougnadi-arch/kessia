import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

// ADR 0042 — livraison Miaride (mode simulé). Achat wallet d'un article
// avec quartier d'enlèvement → demande de livraison → suivi → réception.

async function topUp(request: APIRequestContext, baseURL: string, token: string, amount: number) {
  await request.post(`${baseURL}/api/v1/wallet/deposit`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { amount, method: 'MOBILE_MONEY', account: '+22890000002' },
  });
}

test('livraison Miaride : demande, suivi et confirmation de réception', async ({ page, context, request, baseURL }) => {
  const buyer = await loginViaApi(context, request, baseURL!, SEED.ama);
  await topUp(request, baseURL!, buyer.accessToken, 300_000);

  // L'onduleur de Kossi (SEED.main) — a un quartier d'enlèvement ("be").
  const list = await (await request.get(`${baseURL}/api/v1/marketplace?q=Onduleur`)).json();
  const item = list.data.items.find((i: { pickupZone: string | null }) => i.pickupZone);
  expect(item, 'un article avec pickupZone doit exister').toBeTruthy();

  const orderRes = await request.post(`${baseURL}/api/v1/marketplace/${item.id}/order`, {
    headers: { Authorization: `Bearer ${buyer.accessToken}` },
    data: { mode: 'WALLET' },
  });
  expect(orderRes.status(), await orderRes.text()).toBe(201);
  const orderId = (await orderRes.json()).data.orderId as string;

  // Devis
  const quoteRes = await request.post(`${baseURL}/api/v1/marketplace/deliveries/quote`, {
    headers: { Authorization: `Bearer ${buyer.accessToken}` },
    data: { orderId, dropoffZone: 'baguida' },
  });
  const quote = (await quoteRes.json()).data;
  expect(quote.covered).toBe(true);
  expect(quote.amount).toBeGreaterThan(0);

  // Demande de livraison (mode simulé)
  const reqRes = await request.post(`${baseURL}/api/v1/marketplace/deliveries`, {
    headers: { Authorization: `Bearer ${buyer.accessToken}` },
    data: {
      orderId, mode: 'SIMULATED', dropoffZone: 'baguida',
      dropoffAddress: 'Baguida, près du marché', recipientPhone: '+22890000002',
    },
  });
  expect(reqRes.status(), await reqRes.text()).toBe(201);
  const deliveryId = (await reqRes.json()).data.deliveryId as string;

  // La timeline apparaît sur « mes achats »
  await page.goto('/marketplace/mine');
  await expect(page.getByText('Onduleur 1200 VA + 2 batteries').first()).toBeVisible();
  await expect(page.getByText(/Coursier affecté/)).toBeVisible();

  // Vendeur : marque le colis prêt
  const seller = await request.post(`${baseURL}/api/v1/auth/login`, { data: { phone: SEED.main, password: 'Kessia2026!' } });
  const sellerToken = (await seller.json()).data.accessToken as string;
  const ready = await request.post(`${baseURL}/api/v1/marketplace/deliveries/${deliveryId}`, {
    headers: { Authorization: `Bearer ${sellerToken}` },
    data: { action: 'ready' },
  });
  expect(ready.ok(), await ready.text()).toBeTruthy();

  // L'acheteur confirme la réception → DELIVERED
  const confirm = await request.post(`${baseURL}/api/v1/marketplace/deliveries/${deliveryId}`, {
    headers: { Authorization: `Bearer ${buyer.accessToken}` },
    data: { action: 'confirm' },
  });
  expect((await confirm.json()).data.status).toBe('DELIVERED');
});

test('carnet d’adresses : ajout puis livraison via addressId (ADR 0045)', async ({ context, request, baseURL }) => {
  const buyer = await loginViaApi(context, request, baseURL!, SEED.ama);
  await topUp(request, baseURL!, buyer.accessToken, 300_000);
  const h = { Authorization: `Bearer ${buyer.accessToken}` };

  const created = await request.post(`${baseURL}/api/v1/marketplace/addresses`, {
    headers: h,
    data: { label: 'Bureau E2E', area: 'baguida', address: 'Baguida, immeuble bleu', recipientPhone: '+22890000002' },
  });
  expect(created.status(), await created.text()).toBe(201);
  const addressId = (await created.json()).data.address.id as string;

  // « Présentoir métallique » : Kossi, quartier « be », stock 2 (survit aux autres tests).
  const list = await (await request.get(`${baseURL}/api/v1/marketplace?q=Présentoir`, { headers: h })).json();
  const item = list.data.items.find((i: { pickupZone: string | null }) => i.pickupZone);
  expect(item, 'un article avec pickupZone doit exister').toBeTruthy();
  const orderRes = await request.post(`${baseURL}/api/v1/marketplace/${item.id}/order`, { headers: h, data: { mode: 'WALLET' } });
  const orderId = (await orderRes.json()).data.orderId as string;

  const reqRes = await request.post(`${baseURL}/api/v1/marketplace/deliveries`, {
    headers: h,
    data: { orderId, mode: 'SIMULATED', addressId },
  });
  expect(reqRes.status(), await reqRes.text()).toBe(201);

  // Nettoyage du carnet.
  await request.delete(`${baseURL}/api/v1/marketplace/addresses/${addressId}`, { headers: h });
});

test('règlement à la réception : fonds au séquestre puis versés à la confirmation (ADR 0045)', async ({ request, baseURL }) => {
  const login = await request.post(`${baseURL}/api/v1/auth/login`, { data: { phone: SEED.ama, password: 'Kessia2026!' } });
  const accessToken = (await login.json()).data.accessToken as string;
  const h = { Authorization: `Bearer ${accessToken}` };
  await topUp(request, baseURL!, accessToken, 400_000);

  // Le groupe électrogène de Kossi est en règlement ON_DELIVERY (seed).
  const list = await (await request.get(`${baseURL}/api/v1/marketplace?q=Groupe`, { headers: h })).json();
  const item = list.data.items.find((i: { settlement: string }) => i.settlement === 'ON_DELIVERY');
  expect(item, 'un article ON_DELIVERY doit exister dans le seed').toBeTruthy();

  const orderRes = await request.post(`${baseURL}/api/v1/marketplace/${item.id}/order`, { headers: h, data: { mode: 'WALLET' } });
  expect(orderRes.status(), await orderRes.text()).toBe(201);
  const order = (await orderRes.json()).data;
  expect(order.status).toBe('PENDING_SETTLEMENT');
  expect(order.settlement).toBe('ON_DELIVERY');

  // Livraison + confirmation → le vendeur est réglé (statut PAID).
  const reqRes = await request.post(`${baseURL}/api/v1/marketplace/deliveries`, {
    headers: h,
    data: { orderId: order.orderId, mode: 'SIMULATED', dropoffZone: 'baguida', dropoffAddress: 'Baguida', recipientPhone: '+22890000002' },
  });
  const deliveryId = (await reqRes.json()).data.deliveryId as string;
  const confirm = await request.post(`${baseURL}/api/v1/marketplace/deliveries/${deliveryId}`, {
    headers: h, data: { action: 'confirm' },
  });
  expect((await confirm.json()).data.status).toBe('DELIVERED');

  const mine = await (await request.get(`${baseURL}/api/v1/marketplace/mine`, { headers: h })).json();
  const settled = mine.data.purchases.find((p: { id: string }) => p.id === order.orderId);
  expect(settled.status).toBe('PAID');
});
