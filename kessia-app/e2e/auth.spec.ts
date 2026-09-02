import { test, expect } from '@playwright/test';
import { loginViaForm, loginViaApi, SEED } from './helpers';

test.describe('Authentification & contrôle d’accès', () => {
  test('la landing se charge et mène à l’onboarding', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /commencer/i }).first().click();
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('connexion par mot de passe → accueil, puis déconnexion', async ({ page }) => {
    await loginViaForm(page, SEED.main);
    await expect(page.getByText(/Bonjour/i)).toBeVisible();

    await page.goto('/profile');
    await page.locator('#btn-logout').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('une route protégée sans session redirige vers /login', async ({ page }) => {
    await page.goto('/wallet');
    await expect(page).toHaveURL(/\/login/);
  });

  test('un utilisateur standard ne peut pas accéder à /admin', async ({ page, context, request, baseURL }) => {
    await loginViaApi(context, request, baseURL!, SEED.main);
    await page.goto('/admin/dashboard');
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test('un administrateur accède au back-office', async ({ page, context, request, baseURL }) => {
    await loginViaApi(context, request, baseURL!, SEED.admin);
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.getByRole('heading', { name: /Tableau de bord/i })).toBeVisible();
  });
});
