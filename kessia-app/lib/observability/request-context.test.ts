// ============================================================
// KESSIA — lib/observability/request-context.ts (P1.13-C)
// Couvre H (Winston), I/J (Sentry — tag uniquement, aucune PII),
// K/L (isolation par requête / concurrence).
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { correlateRequest, getCurrentRequestId } from './request-context';
import { logApiError, logger } from '../logger';

const { setTagMock, setContextMock, setExtraMock } = vi.hoisted(() => ({
  setTagMock: vi.fn(),
  setContextMock: vi.fn(),
  setExtraMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  setTag: setTagMock,
  setContext: setContextMock,
  setExtra: setExtraMock,
}));

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fakeRequest(incomingRequestId: string | null): NextRequest {
  return {
    headers: { get: (name: string) => (name === 'x-request-id' ? incomingRequestId : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  setTagMock.mockClear();
  setContextMock.mockClear();
  setExtraMock.mockClear();
});

describe('correlateRequest — Sentry (I, J)', () => {
  it('I. pose un tag Sentry request_id avec un UUID v4 valide', () => {
    const id = correlateRequest(fakeRequest(null));
    expect(setTagMock).toHaveBeenCalledWith('request_id', id);
    expect(UUID_V4_RE.test(id)).toBe(true);
  });

  it("J. n'utilise jamais setContext/setExtra — uniquement un tag simple", () => {
    correlateRequest(fakeRequest(null));
    expect(setContextMock).not.toHaveBeenCalled();
    expect(setExtraMock).not.toHaveBeenCalled();
  });

  it('J. le tag ne contient jamais autre chose que le UUID validé (pas de header/cookie/body)', () => {
    // Une valeur entrante malveillante ressemblant à un header Authorization
    // ne doit jamais se retrouver telle quelle dans le tag.
    correlateRequest(fakeRequest('Bearer secret-token-not-a-uuid'));
    const [, taggedValue] = setTagMock.mock.calls[0] as [string, string];
    expect(taggedValue).not.toContain('Bearer');
    expect(taggedValue).not.toContain('secret-token');
    expect(UUID_V4_RE.test(taggedValue)).toBe(true);
  });
});

describe('correlateRequest + logApiError — Winston (H)', () => {
  it('H. requestId apparaît dans les métadonnées du log pour une même requête', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    try {
      const id = correlateRequest(fakeRequest(null));
      logApiError('/v1/test', new Error('boom'));

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [, meta] = errorSpy.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(meta.requestId).toBe(id);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('sans contexte de corrélation actif, logApiError ne pose pas de requestId trompeur', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    try {
      // Aucun correlateRequest() appelé avant — simule une route hors
      // withAuth (pré-authentification, webhook).
      logApiError('/v1/public', new Error('boom'));
      const [, meta] = errorSpy.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(meta.requestId).toBeUndefined();
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('isolation par requête / concurrence (K, L)', () => {
  it('K. deux requêtes simultanées obtiennent deux request-id indépendants', async () => {
    async function simulateRequest(): Promise<string> {
      const id = correlateRequest(fakeRequest(null));
      // Force un point de suspension asynchrone, comme un vrai handler
      // de route ferait (await Prisma, await fetch, ...).
      await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 10)));
      // L. le contexte lu après un await doit toujours correspondre à
      // CE request-id, jamais à celui d'une autre requête concurrente.
      expect(getCurrentRequestId()).toBe(id);
      return id;
    }

    const [idA, idB, idC] = await Promise.all([
      simulateRequest(),
      simulateRequest(),
      simulateRequest(),
    ]);

    expect(idA).not.toBe(idB);
    expect(idA).not.toBe(idC);
    expect(idB).not.toBe(idC);
  });

  it('L. un x-request-id entrant explicite est bien celui lu pendant SA requête, jamais celui d\'une autre', async () => {
    async function simulateRequest(incoming: string): Promise<{ resolved: string; readBack: string | undefined }> {
      const resolved = correlateRequest(fakeRequest(incoming));
      await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 10)));
      return { resolved, readBack: getCurrentRequestId() };
    }

    const idA = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const idB = 'b3d5c1a2-1111-4222-8333-444455556666';

    const [resA, resB] = await Promise.all([simulateRequest(idA), simulateRequest(idB)]);

    expect(resA.resolved).toBe(idA);
    expect(resA.readBack).toBe(idA);
    expect(resB.resolved).toBe(idB);
    expect(resB.readBack).toBe(idB);
  });
});
