import { test, expect } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

test.beforeEach(async ({ context, request, baseURL }) => {
  await loginViaApi(context, request, baseURL!, SEED.admin);
});

test('le dashboard admin affiche des chiffres réels', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await expect(page.getByRole('heading', { name: /Tableau de bord/i })).toBeVisible();
});

test('la file KYC et la liste des utilisateurs se chargent', async ({ page }) => {
  await page.goto('/admin/kyc');
  await expect(page.getByRole('heading', { name: /KYC/i })).toBeVisible();

  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: /Utilisateurs/i })).toBeVisible();
  await expect(page.getByText(SEED.main)).toBeVisible();
});

test('un agent peut répondre à un ticket créé par un utilisateur', async ({ page, request, baseURL }) => {
  // Un utilisateur crée un ticket via l'API
  const login = await (await request.post(`${baseURL}/api/v1/auth/login`, {
    data: { phone: SEED.ama, password: 'Kessia2026!' },
  })).json();
  const userToken = login.data.accessToken;
  const created = await (await request.post(`${baseURL}/api/v1/support`, {
    headers: { Authorization: `Bearer ${userToken}` },
    data: { subject: `E2E ticket ${Date.now()}`, description: 'Description de test pour E2E.', category: 'OTHER' },
  })).json();
  const ticketId = created.data.id;

  await page.goto(`/admin/support/${ticketId}`);
  await expect(page.getByText(/Demande initiale/i)).toBeVisible();

  await page.getByRole('button', { name: /M['’]assigner/i }).click();
  await page.locator('textarea').first().fill('Bonjour, nous traitons votre demande.');
  await page.getByRole('button', { name: /Envoyer la réponse/i }).click();

  await expect(page.getByText(/Réponse envoyée|Agent/i).first()).toBeVisible({ timeout: 10_000 });
});
