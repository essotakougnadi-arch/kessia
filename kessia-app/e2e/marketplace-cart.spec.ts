import { test, expect } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

// ADR 0041, item 3 — panier multi-articles. Le panier est une commodité
// d'interface (localStorage) qui enchaîne l'API d'achat direct déjà
// existante (POST /marketplace/[id]/order, mode WALLET) une fois par
// article — aucune nouvelle route de commande.

test.beforeEach(async ({ context, request, baseURL }) => {
  await loginViaApi(context, request, baseURL!, SEED.main);
});

test('ajouter un article au panier puis payer débite le wallet et confirme la commande', async ({ page }) => {
  // Recharge largement le wallet pour être sûr de pouvoir payer.
  await page.goto('/wallet?action=deposit');
  await page.locator('#deposit-amount').fill('1000000');
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText(/Dépôt|crédité/i)).toBeVisible({ timeout: 10_000 });

  // Ajoute le premier article disponible au panier depuis le catalogue.
  await page.goto('/marketplace');
  const addButtons = page.locator('[id^="btn-add-cart-"]');
  await expect(addButtons.first()).toBeVisible();
  await addButtons.first().click();
  await expect(page.getByText(/ajouté au panier/i)).toBeVisible();

  // Le badge du panier reflète l'ajout.
  await expect(page.locator('#btn-cart')).toContainText('1');

  // Panier → paiement.
  await page.locator('#btn-cart').click();
  await expect(page).toHaveURL(/\/marketplace\/cart/);
  await expect(page.locator('[id^="btn-qty-plus-"]').first()).toBeVisible();

  await page.locator('#btn-checkout').click();
  await expect(page.getByText(/Commande confirmée|Commande partiellement traitée/)).toBeVisible({ timeout: 15_000 });

  // L'achat apparaît dans « Mes achats ».
  await page.getByRole('link', { name: /voir mes achats/i }).click();
  await expect(page).toHaveURL(/\/marketplace\/mine/);
});
