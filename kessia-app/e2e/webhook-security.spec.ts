// ============================================================
// KESSIA — Sécurité des webhooks entrants, en conditions réelles (P0.3)
//
// Contrairement aux tests d'intégration (qui appellent le handler de
// route directement), ces tests passent par le vrai serveur HTTP
// (`next start`, vrai NODE_ENV=production) — ils vérifient le
// comportement effectivement exposé, pas seulement la logique interne.
// Pas de session : ces endpoints ne sont jamais authentifiés par
// utilisateur (voir l'en-tête des routes).
// ============================================================

import { test, expect } from '@playwright/test';
import crypto from 'crypto';

// Doit correspondre à playwright.config.ts (webServer.env).
const PAYMENT_SECRET = 'e2e-payment-webhook-secret';
const MIARIDE_SECRET = 'e2e-miaride-webhook-secret';

function sign(rawBody: string, secret: string, timestamp = Date.now()): string {
  const tsSec = Math.floor(timestamp / 1000);
  const hmac = crypto.createHmac('sha256', secret).update(`${tsSec}.${rawBody}`).digest('hex');
  return `t=${tsSec},v1=${hmac}`;
}

test.describe('Webhook paiement — POST /api/v1/payments/webhooks/simulator', () => {
  test('sans en-tête de signature → 401', async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/v1/payments/webhooks/simulator`, {
      data: { event: 'payment.completed', reference: 'ref-inexistante' },
    });
    expect(res.status()).toBe(401);
  });

  test('signature invalide (mauvais secret) → 401', async ({ request, baseURL }) => {
    const body = JSON.stringify({ event: 'payment.completed', reference: 'ref-inexistante' });
    const res = await request.post(`${baseURL}/api/v1/payments/webhooks/simulator`, {
      headers: { 'x-kessia-signature': sign(body, 'un-mauvais-secret'), 'content-type': 'application/json' },
      data: body,
    });
    expect(res.status()).toBe(401);
  });

  test('signature valide mais horodatage expiré → 401', async ({ request, baseURL }) => {
    const body = JSON.stringify({ event: 'payment.completed', reference: 'ref-inexistante' });
    const res = await request.post(`${baseURL}/api/v1/payments/webhooks/simulator`, {
      headers: {
        'x-kessia-signature': sign(body, PAYMENT_SECRET, Date.now() - 10 * 60_000),
        'content-type': 'application/json',
      },
      data: body,
    });
    expect(res.status()).toBe(401);
  });

  test('signature valide → passe la vérification (404 métier, pas 401)', async ({ request, baseURL }) => {
    // Référence volontairement inexistante : on vérifie que la couche
    // signature laisse passer (sinon ce serait 401), et que c'est bien
    // la logique métier qui répond ensuite (404, pas une session/auth).
    const body = JSON.stringify({ event: 'payment.completed', reference: 'ref-inexistante-e2e' });
    const res = await request.post(`${baseURL}/api/v1/payments/webhooks/simulator`, {
      headers: { 'x-kessia-signature': sign(body, PAYMENT_SECRET), 'content-type': 'application/json' },
      data: body,
    });
    expect(res.status()).toBe(404);
  });

  test('fournisseur inconnu → 404, avant même la vérification de signature', async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/v1/payments/webhooks/fournisseur-fantome`, {
      data: { event: 'payment.completed', reference: 'x' },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('Webhook Miaride — POST /api/v1/marketplace/deliveries/webhooks/miaride', () => {
  test('sans en-tête de signature → 401', async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/v1/marketplace/deliveries/webhooks/miaride`, {
      data: { event: 'delivery.status', reference: 'MIA-INEXISTANT', status: 'delivered' },
    });
    expect(res.status()).toBe(401);
  });

  test('signature invalide → 401', async ({ request, baseURL }) => {
    const body = JSON.stringify({ event: 'delivery.status', reference: 'MIA-INEXISTANT', status: 'delivered' });
    const res = await request.post(`${baseURL}/api/v1/marketplace/deliveries/webhooks/miaride`, {
      headers: { 'x-miaride-signature': sign(body, 'un-mauvais-secret'), 'content-type': 'application/json' },
      data: body,
    });
    expect(res.status()).toBe(401);
  });

  test('signature valide → passe la vérification (404 métier, référence introuvable)', async ({ request, baseURL }) => {
    const body = JSON.stringify({ event: 'delivery.status', reference: 'MIA-INEXISTANT-E2E', status: 'delivered' });
    const res = await request.post(`${baseURL}/api/v1/marketplace/deliveries/webhooks/miaride`, {
      headers: { 'x-miaride-signature': sign(body, MIARIDE_SECRET), 'content-type': 'application/json' },
      data: body,
    });
    expect(res.status()).toBe(404);
  });
});
