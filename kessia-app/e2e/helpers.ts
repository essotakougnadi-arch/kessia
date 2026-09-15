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
  user: { id: string; phone: string; firstName: string; lastName: string; role: string; kycStatus: string; kycLevel: number; isPhoneVerified: boolean };
};

/**
 * Ouvre une session via l'API et l'injecte dans le navigateur.
 *
 * P0.2 : la réponse de /login pose désormais elle-même les cookies
 * HttpOnly (`kessia-access-token`, `kessia-refresh-token`). Important :
 * l'appel se fait via `context.request` (PAS le fixture `request` — un
 * `APIRequestContext` isolé, avec son propre magasin de cookies, jamais
 * partagé avec le navigateur) pour que `Set-Cookie` soit capturé
 * automatiquement dans les cookies de CE `BrowserContext`, donc envoyés
 * par `page` (middleware edge + repli GET de `withAuth`). `request` reste
 * un paramètre (compat des appelants) mais n'est plus utilisé ici.
 *
 * Volontairement, **plus de `context.setExtraHTTPHeaders({ Authorization })`** :
 * un en-tête fixé une fois pour tout le `BrowserContext` entre en conflit
 * avec le token en mémoire que l'app met à jour dynamiquement
 * (`AuthBootstrap` + rotation du refresh token à chaque `/refresh` —
 * chaque rotation révoque la session précédente ; l'en-tête figé de
 * Playwright continuait de porter l'ANCIEN token, déjà révoqué, sur
 * chaque requête déclenchée par la page → 401 permanent, diagnostiqué
 * empiriquement). Les appels `request.*`/`page.request.*` directs des
 * specs doivent porter leur propre en-tête `Authorization` explicite
 * (déjà le cas de la quasi-totalité d'entre eux ; `Session.accessToken`
 * reste renvoyé pour ça).
 *
 * `localStorage['kessia-auth']` ne porte plus que `{user, isAuthenticated}`
 * (plus de token persisté, cf. `store/authStore.ts`) ; `AuthBootstrap`
 * échange ensuite le cookie de refresh contre un access token en mémoire au
 * premier chargement de page — comme un vrai rechargement d'onglet.
 */
export async function loginViaApi(
  context: BrowserContext,
  _request: APIRequestContext,
  baseURL: string,
  phone: string,
  password = SEED_PASSWORD
): Promise<Session> {
  const res = await context.request.post(`${baseURL}/api/v1/auth/login`, {
    data: { phone, password },
  });
  expect(res.ok(), `login ${phone} → ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const s = body.data as Session;
  expect(s.accessToken, 'la connexion doit renvoyer un token (2FA non attendue en E2E)').toBeTruthy();

  const persisted = JSON.stringify({
    state: { user: s.user, isAuthenticated: true },
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
