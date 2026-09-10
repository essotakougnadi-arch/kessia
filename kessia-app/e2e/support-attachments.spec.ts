import { test, expect } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

// PNG 1×1 transparent
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.beforeEach(async ({ context, request, baseURL }) => {
  await loginViaApi(context, request, baseURL!, SEED.main);
});

// Chaque test crée SON PROPRE ticket (au lieu de réutiliser un ticket du
// seed) : la pièce jointe et le plafond `MAX_ATTACHMENTS_PER_TICKET`
// restent isolés run après run, même sur une base non réinitialisée.
async function freshTicket(page: import('@playwright/test').Page): Promise<string> {
  const res = await page.request.post('/api/v1/support', {
    data: {
      category: 'ACCOUNT',
      subject: `E2E pièce jointe ${Date.now()}`,
      description: 'Ticket créé par la suite E2E pour tester les pièces jointes.',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data.id as string;
}

test('un utilisateur joint une pièce à son ticket et la retrouve', async ({ page }) => {
  const ticketId = await freshTicket(page);

  const up = await page.request.post(`/api/v1/support/${ticketId}/attachments`, {
    data: { fileName: 'preuve.png', dataUrl: PNG_1PX },
  });
  expect(up.status(), await up.text()).toBe(201);

  const list = await (await page.request.get(`/api/v1/support/${ticketId}/attachments`)).json();
  const names = (list.data as { fileName: string }[]).map((a) => a.fileName);
  expect(names).toContain('preuve.png');
});

test('un type de fichier non autorisé est refusé', async ({ page }) => {
  const ticketId = await freshTicket(page);

  const res = await page.request.post(`/api/v1/support/${ticketId}/attachments`, {
    data: { fileName: 'script.html', dataUrl: 'data:text/html;base64,PGgxPmhpPC9oMT4=' },
  });
  expect(res.status()).toBe(400);
});

test('joindre une pièce à un ticket inconnu est refusé', async ({ page }) => {
  const res = await page.request.post('/api/v1/support/ticket-inexistant/attachments', {
    data: { fileName: 'x.png', dataUrl: PNG_1PX },
  });
  expect([403, 404]).toContain(res.status());
});
