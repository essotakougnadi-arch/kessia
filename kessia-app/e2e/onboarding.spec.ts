import { test, expect } from '@playwright/test';

test.describe('Onboarding', () => {
  test('parcourt le carrousel jusqu’au bout', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { name: /Bienvenue sur KESSIA/i })).toBeVisible();

    // 3 clics « Suivant » puis le CTA final
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /suivant/i }).click();
    }
    await page.getByRole('button', { name: /créer mon compte/i }).click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('« Passer » mène directement à l’inscription', async ({ page }) => {
    await page.goto('/onboarding');
    await page.getByRole('button', { name: /passer/i }).click();
    await expect(page).toHaveURL(/\/register/);
  });
});
