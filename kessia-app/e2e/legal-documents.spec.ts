import { test, expect } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

test('les pages légales sont publiques et lisibles', async ({ page }) => {
  await page.goto('/legal/terms');
  await expect(page.getByRole('heading', { name: /Conditions générales d’utilisation/i })).toBeVisible();
  await expect(page.getByText(/Projet — version de travail/i)).toBeVisible();

  await page.goto('/legal/privacy');
  await expect(page.getByRole('heading', { name: /Politique de confidentialité/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Durées de conservation/i })).toBeVisible();

  await page.goto('/legal/mentions');
  await expect(page.getByRole('heading', { name: /Mentions légales/i })).toBeVisible();
});

test.describe('documents imprimables', () => {
  test.beforeEach(async ({ context, request, baseURL }) => {
    await loginViaApi(context, request, baseURL!, SEED.main);
  });

  test('la facture s’ouvre en document imprimable', async ({ page }) => {
    // récupère une facture de Kossi via l'API (page.request est authentifié)
    const bizRes = await page.request.get('/api/v1/business');
    const businessId = (await bizRes.json()).data[0].id;
    const invRes = await page.request.get(`/api/v1/business/${businessId}/invoices`);
    const invoiceId = (await invRes.json()).data[0].id;

    await page.goto(`/documents/invoice/${businessId}/${invoiceId}`);
    await expect(page.getByRole('button', { name: /Imprimer/i })).toBeVisible();
    await expect(page.getByText(/Total (TTC|estimé)/i)).toBeVisible();
    await expect(page.getByText(/Émis par/i)).toBeVisible();
  });

  test('un reçu wallet s’ouvre en document imprimable', async ({ page }) => {
    const txRes = await page.request.get('/api/v1/wallet/transactions?limit=1');
    const txId = (await txRes.json()).data.entries[0].id;

    await page.goto(`/documents/receipt/${txId}`);
    await expect(page.getByRole('button', { name: /Imprimer/i })).toBeVisible();
    await expect(page.getByText(/Reçu d’opération/i)).toBeVisible();
    await expect(page.getByText(/Solde après opération/i)).toBeVisible();
  });

  test('PDF serveur : facture + reçu, et envoi e-mail simulé (§7)', async ({ page }) => {
    const businessId = (await (await page.request.get('/api/v1/business')).json()).data[0].id;
    const invoiceId = (await (await page.request.get(`/api/v1/business/${businessId}/invoices`)).json()).data[0].id;

    const pdf = await page.request.get(`/api/v1/business/${businessId}/invoices/${invoiceId}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    const head = (await pdf.body()).subarray(0, 5).toString('latin1');
    expect(head).toBe('%PDF-');

    const txId = (await (await page.request.get('/api/v1/wallet/transactions?limit=1')).json()).data.entries[0].id;
    const receipt = await page.request.get(`/api/v1/wallet/transactions/${txId}/pdf`);
    expect(receipt.status()).toBe(200);
    expect((await receipt.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // envoi e-mail : aucun fournisseur configuré → simulation enregistrée
    const mail = await page.request.post(`/api/v1/business/${businessId}/invoices/${invoiceId}/email`, {
      data: { to: 'client-e2e@example.com' },
    });
    expect(mail.status()).toBe(200);
    const body = (await mail.json()).data;
    expect(body.sent).toBe(true);
    expect(body.simulated).toBe(true);
  });
});
