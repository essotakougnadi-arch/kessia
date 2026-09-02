import { test, expect } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

const YAO = '+22890000005'; // KYC NOT_STARTED → plafond 50 000 FCFA / opération

test.describe('Trust Center & agenda', () => {
  test.beforeEach(async ({ context, request, baseURL }) => {
    await loginViaApi(context, request, baseURL!, SEED.main);
  });

  test('le Trust Center affiche tarifs, plafonds et mentions', async ({ page }) => {
    await page.goto('/trust');
    await expect(page.getByRole('heading', { name: /Transparence & tarifs/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Grille tarifaire/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Vos plafonds/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Mentions réglementaires/i })).toBeVisible();
  });

  test('l’agenda agrège les échéances', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.getByRole('heading', { name: /Agenda/i })).toBeVisible();
    await expect(page.getByText(/Cette semaine/i)).toBeVisible();
  });
});

test('un transfert au-dessus du plafond KYC est refusé (compte non vérifié)', async ({ context, request, baseURL }) => {
  // Yao : KYC NOT_STARTED → plafond 50 000 FCFA / opération, solde suffisant (120 000).
  const s = await loginViaApi(context, request, baseURL!, YAO);
  const res = await request.post(`${baseURL}/api/v1/wallet/transfer`, {
    headers: { authorization: `Bearer ${s.accessToken}` },
    data: { recipientPhone: '+22890000002', amount: 80_000 },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(`${body.error ?? body.message ?? ''}`.toLowerCase()).toMatch(/plafond|identité/);
});

test('la file anti-fraude admin liste les alertes', async ({ context, request, baseURL, page }) => {
  await loginViaApi(context, request, baseURL!, SEED.admin);
  await page.goto('/admin/fraud');
  await expect(page.getByRole('heading', { name: /Anti-fraude/i })).toBeVisible();
  await expect(page.getByText(/transferts en moins de 10 minutes/i)).toBeVisible();
});
