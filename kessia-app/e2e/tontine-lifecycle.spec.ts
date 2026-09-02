import { test, expect, type APIRequestContext } from '@playwright/test';
import { SEED, SEED_PASSWORD } from './helpers';

// ============================================================
// Parcours critique (§12) : une tontine à 3 membres démarre
// automatiquement quand elle est complète, puis un tour complet
// déclenche le versement au bénéficiaire.
// ============================================================

async function token(request: APIRequestContext, baseURL: string, phone: string) {
  const r = await request.post(`${baseURL}/api/v1/auth/login`, { data: { phone, password: SEED_PASSWORD } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).data.accessToken as string;
}
const auth = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

test('cycle de tontine : démarrage auto + versement au bénéficiaire', async ({ request, baseURL }) => {
  test.setTimeout(120_000); // chaîne d'écritures ledger + notifications contre une base distante
  const base = baseURL!;
  const [t1, t2, t3] = await Promise.all([
    token(request, base, SEED.main),
    token(request, base, SEED.ama),
    token(request, base, SEED.koffi),
  ]);

  // 1. Création (3 membres, cotisation 500)
  const create = await request.post(`${base}/api/v1/tontine`, {
    ...auth(t1),
    data: {
      name: `E2E Cycle ${Date.now()}`,
      amount: 500,
      frequency: 'WEEKLY',
      startDate: new Date().toISOString(),
      maxMembers: 3,
    },
  });
  expect(create.ok()).toBeTruthy();
  const { id: tontineId, inviteCode } = (await create.json()).data;

  // 2. Les deux autres rejoignent → la 3ᵉ adhésion démarre la tontine
  await request.post(`${base}/api/v1/tontine/join`, { ...auth(t2), data: { code: inviteCode } });
  const join3 = await request.post(`${base}/api/v1/tontine/join`, { ...auth(t3), data: { code: inviteCode } });
  expect((await join3.json()).data.started).toBe(true);

  let detail = await (await request.get(`${base}/api/v1/tontine/${tontineId}`, auth(t1))).json();
  expect(detail.data.status).toBe('ACTIVE');
  expect(detail.data.currentRound).toBe(1);
  expect(detail.data.schedules.length).toBe(3);

  // 3. Solde du bénéficiaire du tour 1 (position 1 = créateur) avant versement
  const balBefore = Number((await (await request.get(`${base}/api/v1/wallet`, auth(t1))).json()).data.balance);

  // 4. Les 3 membres cotisent au tour 1
  for (const t of [t1, t2, t3]) {
    const c = await request.post(`${base}/api/v1/tontine/${tontineId}/contribute`, { ...auth(t), data: { round: 1 } });
    expect(c.ok(), await c.text()).toBeTruthy();
  }

  // 5. Le tour est complet → versement (500 × 3 = 1500) au bénéficiaire, passage au tour 2
  detail = await (await request.get(`${base}/api/v1/tontine/${tontineId}`, auth(t1))).json();
  expect(detail.data.currentRound).toBe(2);
  const recipient = detail.data.members.find((m: { orderPosition: number }) => m.orderPosition === 1);
  expect(recipient.totalReceived).toBe(1500);

  const balAfter = Number((await (await request.get(`${base}/api/v1/wallet`, auth(t1))).json()).data.balance);
  // net = -500 (cotisation) + 1500 (cagnotte) = +1000
  expect(balAfter).toBe(balBefore + 1000);
});
