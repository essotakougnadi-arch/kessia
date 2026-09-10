import { test, expect } from '@playwright/test';
import { SEED, SEED_PASSWORD } from './helpers';

// Couverture des zones peu testées (ADR 0045 — finitions) :
// upload KYC, cas limites du code PIN, écritures back-office.
// Tests au niveau API : rapides et déterministes.

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function token(request: import('@playwright/test').APIRequestContext, baseURL: string, phone: string) {
  const r = await request.post(`${baseURL}/api/v1/auth/login`, { data: { phone, password: SEED_PASSWORD } });
  expect(r.ok(), `login ${phone}`).toBeTruthy();
  return (await r.json()).data.accessToken as string;
}

test.describe('Upload KYC', () => {
  test('accepte une image, refuse un non-image, et liste la pièce', async ({ request, baseURL }) => {
    const t = await token(request, baseURL!, SEED.ama);
    const h = { Authorization: `Bearer ${t}` };

    const bad = await request.post(`${baseURL}/api/v1/kyc/documents`, {
      headers: h, data: { type: 'NATIONAL_ID', dataUrl: 'data:application/pdf;base64,AAAA' },
    });
    expect(bad.status()).toBe(400);

    const okRes = await request.post(`${baseURL}/api/v1/kyc/documents`, {
      headers: h, data: { type: 'NATIONAL_ID', dataUrl: PNG_1PX },
    });
    expect(okRes.status(), await okRes.text()).toBe(201);

    const list = await (await request.get(`${baseURL}/api/v1/kyc/documents`, { headers: h })).json();
    const types = (list.data.documents ?? list.data ?? []).map((d: { type: string }) => d.type);
    expect(types).toContain('NATIONAL_ID');

    // Nettoyage : retire la pièce ajoutée.
    await request.delete(`${baseURL}/api/v1/kyc/documents?type=NATIONAL_ID`, { headers: h });
  });
});

test.describe('Code PIN — cas limites', () => {
  test('code trop court refusé ; mauvais code refusé ; désactivation idempotente', async ({ request, baseURL }) => {
    const t = await token(request, baseURL!, SEED.ama);
    const h = { Authorization: `Bearer ${t}` };

    const short = await request.post(`${baseURL}/api/v1/auth/pin`, { headers: h, data: { pin: '12' } });
    expect(short.status()).toBe(400);

    const set = await request.post(`${baseURL}/api/v1/auth/pin`, { headers: h, data: { pin: '4791' } });
    expect(set.status(), await set.text()).toBe(200);

    const wrong = await request.post(`${baseURL}/api/v1/auth/pin/verify`, { headers: h, data: { pin: '0000' } });
    expect(wrong.status()).toBe(400);
    expect((await wrong.json()).error).toMatch(/incorrect/i);

    const right = await request.post(`${baseURL}/api/v1/auth/pin/verify`, { headers: h, data: { pin: '4791' } });
    expect(right.status()).toBe(200);

    const off1 = await request.delete(`${baseURL}/api/v1/auth/pin`, { headers: h });
    expect(off1.status()).toBe(200);
    const off2 = await request.delete(`${baseURL}/api/v1/auth/pin`, { headers: h });
    expect(off2.status()).toBe(400); // déjà désactivé

    // Après désactivation, la vérification n'est plus possible.
    const verifyOff = await request.post(`${baseURL}/api/v1/auth/pin/verify`, { headers: h, data: { pin: '4791' } });
    expect(verifyOff.status()).toBe(400);
  });
});

test.describe('Écritures back-office', () => {
  test('un USER standard ne peut pas modérer', async ({ request, baseURL }) => {
    const userTok = await token(request, baseURL!, SEED.ama);
    const target = await token(request, baseURL!, SEED.koffi); // pour récupérer un id
    const me = await (await request.get(`${baseURL}/api/v1/profile`, { headers: { Authorization: `Bearer ${target}` } })).json();
    const targetId = me.data.id ?? me.data.user?.id;

    const res = await request.patch(`${baseURL}/api/v1/admin/users/${targetId}`, {
      headers: { Authorization: `Bearer ${userTok}` },
      data: { action: 'suspend' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('admin suspend puis réactive un compte ; erase refusé sans demande de suppression', async ({ request, baseURL }) => {
    const adminTok = await token(request, baseURL!, SEED.admin);
    const koffiTok = await token(request, baseURL!, SEED.koffi);
    const me = await (await request.get(`${baseURL}/api/v1/profile`, { headers: { Authorization: `Bearer ${koffiTok}` } })).json();
    const targetId = me.data.id ?? me.data.user?.id;
    const h = { Authorization: `Bearer ${adminTok}` };

    try {
      const suspend = await request.patch(`${baseURL}/api/v1/admin/users/${targetId}`, {
        headers: h, data: { action: 'suspend', reason: 'E2E test' },
      });
      expect(suspend.status(), await suspend.text()).toBe(200);
      expect((await suspend.json()).data.isActive).toBe(false);

      // erase exige une demande de suppression instruite → refusé ici.
      const erase = await request.patch(`${baseURL}/api/v1/admin/users/${targetId}`, {
        headers: h, data: { action: 'erase' },
      });
      expect(erase.status()).toBe(400);
      expect((await erase.json()).error).toMatch(/suppression/i);
    } finally {
      // Toujours réactiver le compte, même si une assertion a échoué.
      await request.patch(`${baseURL}/api/v1/admin/users/${targetId}`, {
        headers: h, data: { action: 'reactivate' },
      });
    }
  });
});
