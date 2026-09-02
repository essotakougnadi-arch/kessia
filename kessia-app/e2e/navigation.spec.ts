import { test, expect } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

test.beforeEach(async ({ context, request, baseURL }) => {
  await loginViaApi(context, request, baseURL!, SEED.main);
});

test('la navigation principale mène à chaque module', async ({ page }) => {
  await page.goto('/home');
  const nav = page.getByRole('navigation', { name: /navigation mobile/i });

  await nav.getByRole('link', { name: /wallet/i }).click();
  await expect(page).toHaveURL(/\/wallet/);

  await nav.getByRole('link', { name: /tontines/i }).click();
  await expect(page).toHaveURL(/\/tontine/);

  await nav.getByRole('link', { name: /business/i }).click();
  await expect(page).toHaveURL(/\/business/);

  await nav.getByRole('link', { name: /profil/i }).click();
  await expect(page).toHaveURL(/\/profile/);
});

test('le profil ouvre le KESSIA Score détaillé', async ({ page }) => {
  await page.goto('/profile/score');
  await expect(page.getByRole('heading', { name: /KESSIA Score/i })).toBeVisible();
  await expect(page.getByText(/\/ 1000/)).toBeVisible();
  await expect(page.getByText(/Ce qui compose votre score/i)).toBeVisible();
});

test('la couleur d’accent Brique s’applique et persiste', async ({ page }) => {
  await page.goto('/profile');
  await page.getByText(/Couleur d’accent/i).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Brique/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'brique');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'brique');

  // remettre Terracotta (pas d'attribut)
  await page.getByText(/Couleur d’accent/i).click();
  await page.getByRole('dialog').getByRole('button', { name: /Terracotta/i }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-accent', /.+/);
});

test('les écrans de compte se chargent', async ({ page }) => {
  await page.goto('/profile/security');
  await expect(page.getByRole('heading', { name: /Sécurité/i })).toBeVisible();

  await page.goto('/profile/privacy');
  await expect(page.getByRole('heading', { name: /Confidentialité/i })).toBeVisible();

  await page.goto('/profile/notifications');
  await expect(page.getByRole('heading', { name: /Notifications/i })).toBeVisible();
});

test('KESSIA AI répond à une question', async ({ page }) => {
  await page.goto('/ai');
  await page.locator('#ai-input').fill('Comment déposer de l’argent ?');
  await page.locator('#btn-send-ai').click();
  // Réponse du moteur de règles (entrée « deposit »)
  await expect(page.getByText(/TMoney|Flooz|Mobile Money/i).first()).toBeVisible({ timeout: 15_000 });
});

test('le bandeau hors ligne apparaît puis disparaît au retour du réseau (§51)', async ({ page }) => {
  await page.goto('/home');
  const banner = page.getByRole('status').filter({ hasText: /Hors ligne|Offline/i });
  await expect(banner).toBeHidden();

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  await expect(banner).toBeVisible({ timeout: 5_000 });

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    window.dispatchEvent(new Event('online'));
  });
  await expect(banner).toBeHidden({ timeout: 5_000 });
});
