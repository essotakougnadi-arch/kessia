import { test, expect } from '@playwright/test';
import { loginViaApi, SEED } from './helpers';

// PNG 1×1 transparent
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.beforeEach(async ({ context, request, baseURL }) => {
  await loginViaApi(context, request, baseURL!, SEED.main);
});

test('un utilisateur joint une pièce à son ticket et la retrouve', async ({ page }) => {
  const tickets = await (await page.request.get('/api/v1/support')).json();
  const ticket = (tickets.data as { id: string; status: string }[]).find((t) => t.status !== 'CLOSED');
  expect(ticket, 'un ticket non fermé doit exister dans le seed').toBeTruthy();

  const up = await page.request.post(`/api/v1/support/${ticket!.id}/attachments`, {
    data: { fileName: 'preuve.png', dataUrl: PNG_1PX },
  });
  expect(up.status(), await up.text()).toBe(201);

  const list = await (await page.request.get(`/api/v1/support/${ticket!.id}/attachments`)).json();
  const names = (list.data as { fileName: string }[]).map((a) => a.fileName);
  expect(names).toContain('preuve.png');
});

test('un type de fichier non autorisé est refusé', async ({ page }) => {
  const tickets = await (await page.request.get('/api/v1/support')).json();
  const ticket = (tickets.data as { id: string; status: string }[]).find((t) => t.status !== 'CLOSED');

  const res = await page.request.post(`/api/v1/support/${ticket!.id}/attachments`, {
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
