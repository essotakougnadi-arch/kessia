import { test, expect } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

test.beforeEach(async ({ context, request, baseURL }) => {
  await loginViaApi(context, request, baseURL!, SEED.main);
});

test('le wallet affiche un solde et l’historique', async ({ page }) => {
  await page.goto('/wallet');
  await expect(page.getByText(/FCFA/).first()).toBeVisible();
  // historique présent (au moins un libellé de transaction ou l'état vide)
  await expect(page.getByText(/transaction|Aucune|Historique/i).first()).toBeVisible();
});

test('un dépôt simulé crédite le wallet', async ({ page }) => {
  const before = await (await page.request.get('/api/v1/wallet')).json();
  const start = Number(before.data.balance);

  await page.goto('/wallet?action=deposit');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#deposit-amount').fill('1500');
  await dialog.getByRole('button', { name: /Confirmer le dépôt/i }).click();

  await expect
    .poll(async () => {
      const r = await (await page.request.get('/api/v1/wallet')).json();
      return Number(r.data.balance);
    }, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(start + 1500);
});

test('un transfert vers un numéro inconnu est refusé', async ({ page }) => {
  // Le solde doit être chargé avant d'ouvrir la modale (le formulaire valide contre le solde).
  await page.goto('/wallet');
  await expect(page.getByText(/Solde disponible/i)).toBeVisible();
  await page.locator('#btn-send').click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Solde disponible :/i)).toBeVisible();
  await dialog.locator('#transfer-phone').fill('99999999');
  await dialog.locator('#transfer-amount').fill('100');
  await dialog.getByRole('button', { name: /^Envoyer$/ }).click();
  await expect(dialog.getByText(/Aucun compte KESSIA|introuvable/i)).toBeVisible({ timeout: 10_000 });
});
