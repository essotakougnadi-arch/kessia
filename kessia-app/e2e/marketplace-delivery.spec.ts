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
