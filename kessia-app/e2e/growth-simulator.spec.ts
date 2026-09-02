import { test, expect } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

test.beforeEach(async ({ context, request, baseURL }) => {
  await loginViaApi(context, request, baseURL!, SEED.main);
});

test('le plan de croissance affiche des étapes et enregistre la progression', async ({ page }) => {
  await page.goto('/growth');
  await expect(page.getByRole('heading', { name: /Plan de croissance/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /KESSIA Score/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /→$/ }).first()).toBeVisible();

  // Marquer la première étape « Fait »
  await page.getByRole('button', { name: 'Fait', exact: true }).first().click();
  await expect(page.getByText(/Plan mis à jour|fait le/i).first()).toBeVisible();
});

test('les simulateurs calculent des projections', async ({ page }) => {
  await page.goto('/simulator?sim=savings');
  await expect(page.getByRole('heading', { name: /Simulateurs/i })).toBeVisible();
  await expect(page.getByText(/Total versé/i)).toBeVisible();
  await expect(page.getByText(/Capital à/i)).toBeVisible();

  await page.getByRole('button', { name: /Tontine/i }).click();
  await expect(page.getByText(/Cagnotte par tour/i)).toBeVisible();
  await expect(page.getByText(/Total que vous recevez/i)).toBeVisible();

  await page.getByRole('button', { name: /Activité/i }).click();
  await expect(page.getByText(/Seuil de rentabilité/i)).toBeVisible();
});
