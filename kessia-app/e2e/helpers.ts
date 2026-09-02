import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

/** Comptes de démonstration (prisma/seed.ts). Mot de passe commun. */
export const SEED_PASSWORD = 'Kessia2026!';
export const SEED = {
  main: '+22890000001', // Kossi Amétépé — USER, KYC vérifié
  ama: '+22890000002',
  koffi: '+22890000003',
  admin: '+22890000000', // Admin KESSIA — ADMIN
};

type Session = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; phone: string; firstName: string; lastName: string; role: string; kycStatus: string; kycLevel: number; isPhoneVerified: boolean };
};

/** Ouvre une session via l'API et l'injecte dans le navigateur (cookie + localStorage). */
export async function loginViaApi(
  context: BrowserContext,
  request: APIRequestContext,
  baseURL: string,
  phone: string,
  password = SEED_PASSWORD
): Promise<Session> {
  const res = await request.post(`${baseURL}/api/v1/auth/login`, {
    data: { phone, password },
  });
  expect(res.ok(), `login ${phone} → ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const s = body.data as Session;
  expect(s.accessToken, 'la connexion doit renvoyer un token (2FA non attendue en E2E)').toBeTruthy();

  const url = new URL(baseURL);
  await context.addCookies([
    { name: 'kessia-access-token', value: s.accessToken, domain: url.hostname, path: '/', sameSite: 'Lax' },
  ]);

  // Pour que page.request.* soit authentifié comme l'utilisateur courant.
  await context.setExtraHTTPHeaders({ Authorization: `Bearer ${s.accessToken}` });

  const persisted = JSON.stringify({
    state: { user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken, isAuthenticated: true },
    version: 0,
  });
  await context.addInitScript((value) => {
    window.localStorage.setItem('kessia-auth', value);
  }, persisted);

  return s;
}

/** Connexion via le formulaire (parcours réel). */
export async function loginViaForm(page: Page, phone: string, password = SEED_PASSWORD) {
  await page.goto('/login');
  await page.locator('#phone-login').fill(phone.replace('+228', ''));
  await page.locator('#password-login').fill(password);
  await page.locator('#btn-login').click();
  await page.waitForURL(/\/home/, { timeout: 15_000 });
}
