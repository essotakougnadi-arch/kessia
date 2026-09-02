import { test, expect } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

test.beforeEach(async ({ context, request, baseURL }) => {
  await loginViaApi(context, request, baseURL!, SEED.main);
});

test('la liste des tontines se charge', async ({ page }) => {
  await page.goto('/tontine');
  await expect(page.getByRole('heading', { name: /Mes Tontines/i })).toBeVisible();
});

test('les 4 types de tontines sont présentés', async ({ page }) => {
  await page.goto('/tontine');
  const section = page.locator('section', { hasText: 'Les 4 types de tontines' });
  await expect(section.getByText('Tontine Classique Tournante')).toBeVisible();
  await expect(section.getByText('Tontine Projet')).toBeVisible();
  await expect(section.getByText('Tontine Croissance')).toBeVisible();
  await expect(section.getByText('Tontine Achat')).toBeVisible();
});

test('créer une tontine (type Achat) puis la retrouver dans la liste', async ({ page }) => {
  const name = `E2E Tontine ${Date.now()}`;
  await page.goto('/tontine?type=PURCHASE');
  const dialog = page.getByRole('dialog');

  await expect(dialog.getByRole('button', { name: /🛒 Achat/ })).toHaveAttribute('aria-pressed', 'true');
  await dialog.locator('#t-name').fill(name);
  await dialog.locator('#t-amount').fill('2000');
  await dialog.locator('#t-members').fill('4');
  await dialog.getByRole('button', { name: /Créer la tontine/i }).click();

  await expect(page.getByText(/créée avec succès/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
});

test('créer un plan d’Achat individuel (solo) puis le retrouver dans la liste', async ({ page }) => {
  const name = `E2E Achat solo ${Date.now()}`;
  await page.goto('/tontine?type=PURCHASE');
  const dialog = page.getByRole('dialog');

  await dialog.getByRole('button', { name: /Individuel/ }).click();
  await expect(dialog.getByRole('button', { name: /Individuel/ })).toHaveAttribute('aria-pressed', 'true');

  await dialog.locator('#t-name').fill(name);
  await dialog.locator('#t-item').fill('Vélo cargo');
  await dialog.locator('#t-target').fill('180000');
  await dialog.locator('#t-rounds').fill('6');
  await expect(dialog.getByText(/par versement/i)).toBeVisible();

  await dialog.getByRole('button', { name: /Créer mon plan d’achat/i }).click();

  await expect(page.getByText(/Plan d'achat individuel/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
});

test('la modale « rejoindre par code » rejette un code invalide', async ({ page }) => {
  await page.goto('/tontine?join=1');
  const dialog = page.getByRole('dialog');
  await dialog.locator('#t-join-code').fill('KESS-XXXXXX');
  await dialog.getByRole('button', { name: /^Rejoindre$/i }).click();
  await expect(page.getByText(/Aucune tontine ne correspond|invalide/i)).toBeVisible({ timeout: 10_000 });
});
