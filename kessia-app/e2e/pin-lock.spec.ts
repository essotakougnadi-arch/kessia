import { test, expect } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

// ADR 0041, item 1 — code PIN de déverrouillage rapide. Le PIN ne
// remplace pas l'authentification : on vérifie ici uniquement le
// verrou client (sessionStorage par onglet), pas les jetons de session.

test.beforeEach(async ({ context, request, baseURL }) => {
  await loginViaApi(context, request, baseURL!, SEED.main);
});

test('activer un code PIN verrouille les nouveaux onglets jusqu’à saisie correcte', async ({ page, context }) => {
  // Active le PIN depuis Sécurité.
  await page.goto('/profile/security');
  await page.locator('#btn-enable-pin').click();
  await page.locator('#pin-new').fill('1234');
  await page.locator('#pin-confirm').fill('1234');
  await page.locator('#btn-confirm-pin').click();
  await expect(page.locator('#btn-disable-pin')).toBeVisible();

  // Nouvel onglet du même contexte : mêmes jetons (localStorage/cookie
  // partagés), mais sessionStorage vierge → doit se verrouiller.
  const locked = await context.newPage();
  await locked.goto('/home');
  await expect(locked.locator('#pin-lock-input')).toBeVisible();

  // Mauvais code → rejeté, toujours verrouillé.
  await locked.locator('#pin-lock-input').fill('0000');
  await locked.locator('#btn-pin-unlock').click();
  await expect(locked.getByText('Code incorrect.')).toBeVisible();
  await expect(locked.locator('#pin-lock-input')).toBeVisible();

  // Bon code → déverrouille, le tableau de bord redevient accessible.
  await locked.locator('#pin-lock-input').fill('1234');
  await locked.locator('#btn-pin-unlock').click();
  await expect(locked.locator('#pin-lock-input')).toHaveCount(0);
  await expect(locked).toHaveURL(/\/home/);

  // Nettoyage : désactive le PIN pour ne pas verrouiller les autres tests.
  await locked.goto('/profile/security');
  await locked.locator('#btn-disable-pin').click();
  await locked.locator('#btn-confirm-disable-pin').click();
  await expect(locked.locator('#btn-enable-pin')).toBeVisible();
});
