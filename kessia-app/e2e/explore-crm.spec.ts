import { test, expect } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

test.beforeEach(async ({ context, request, baseURL }) => {
  await loginViaApi(context, request, baseURL!, SEED.main);
});

test('le hub Explorer liste les modules et enregistre un intérêt', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: /Explorer KESSIA/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Disponible$/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Feuille de route/i })).toBeVisible();

  const interest = page.getByRole('button', { name: /intéresser|pr[ée]venu/i }).first();
  await interest.click();
  await expect(page.getByRole('button', { name: /pr[ée]venu/i }).first()).toBeVisible();
});

test('le détail business expose le CRM clients et l’ADN', async ({ page }) => {
  await page.goto('/business');
  await page.getByRole('link', { name: /Gérer/i }).first().click();
  await expect(page).toHaveURL(/\/business\/.+/);

  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await expect(page.getByText(/Chantier BTP Agoè/i)).toBeVisible();

  await page.getByRole('button', { name: 'ADN', exact: true }).click();
  await expect(page.getByText(/Santé :/i)).toBeVisible();
});
