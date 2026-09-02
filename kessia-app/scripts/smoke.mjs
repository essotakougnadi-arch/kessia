// ============================================================
// KESSIA — Smoke tests post-déploiement (cahier des charges §50)
//
//   SMOKE_BASE_URL=https://staging.kessia.app \
//   SMOKE_PHONE=+228... SMOKE_PASSWORD=... \
//   node scripts/smoke.mjs
//
// Vérifie que l'environnement répond et qu'un parcours minimal
// fonctionne (santé → login → wallet → tontines). Sort en code 1
// au premier échec.
// ============================================================

const BASE = (process.env.SMOKE_BASE_URL || '').replace(/\/$/, '');
const PHONE = process.env.SMOKE_PHONE || '';
const PASSWORD = process.env.SMOKE_PASSWORD || '';

if (!BASE) {
  console.log('SMOKE_BASE_URL absent — smoke tests ignorés.');
  process.exit(0);
}

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL ${name} — ${e.message}`);
  }
}

async function json(path, opts) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

await check('GET /api/health → 200 ok', async () => {
  const r = await json('/api/health');
  if (r.status !== 200 || r.body?.status !== 'ok') throw new Error(`status=${r.status} body=${JSON.stringify(r.body)}`);
});

await check('GET / → 200', async () => {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) throw new Error(`status=${res.status}`);
});

if (PHONE && PASSWORD) {
  let token = '';
  await check('POST /api/v1/auth/login → token', async () => {
    const r = await json('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
    });
    token = r.body?.data?.accessToken;
    if (!token) throw new Error(`pas de token (status=${r.status})`);
  });

  if (token) {
    const auth = { headers: { authorization: `Bearer ${token}` } };
    await check('GET /api/v1/wallet → 200', async () => {
      const r = await json('/api/v1/wallet', auth);
      if (r.status !== 200) throw new Error(`status=${r.status}`);
    });
    await check('GET /api/v1/tontine → 200', async () => {
      const r = await json('/api/v1/tontine', auth);
      if (r.status !== 200) throw new Error(`status=${r.status}`);
    });
  }
} else {
  console.log('  (SMOKE_PHONE / SMOKE_PASSWORD absents — parcours authentifié ignoré)');
}

console.log(failures === 0 ? '\n✅ Smoke tests OK' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
