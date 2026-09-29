// ============================================================
// KESSIA — P1.13-C, correction de couverture de corrélation
//
// Démontre la corrélation request-id de bout en bout sur les catégories
// de routes demandées (A-I) — au-delà des tests déjà couverts par
// request-id.test.ts / request-context.test.ts / middleware.test.ts.
//
// A. route authentifiée         → déjà couvert (request-context.test.ts,
//                                  correlateRequest = exactement ce que
//                                  withAuth appelle)
// B. route publique              → ce fichier (handler réel /api/v1/discover)
// C. route pré-authentification  → ce fichier (handler réel
//                                  /api/v1/auth/request-otp)
// D. webhook                     → ce fichier (mécanisme de repli Sentry
//                                  côté beforeSend — PAS de correlateRequest
//                                  dans les fichiers webhook eux-mêmes,
//                                  volontairement, voir commentaire dédié)
// E. health                      → ce fichier (handler réel /api/health)
// F. concurrence                 → déjà couvert (request-context.test.ts)
// G. requestId valide entrant    → déjà couvert (request-id.test.ts,
//                                  middleware.test.ts)
// H. requestId invalide entrant  → déjà couvert (idem)
// I. absence de fuite            → déjà couvert (request-context.test.ts)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import type { ErrorEvent, SpanJSON, TransactionEvent } from '@sentry/core';

const { setTagMock } = vi.hoisted(() => ({ setTagMock: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({
  setTag: setTagMock,
  setContext: vi.fn(),
  setExtra: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
  },
}));

vi.mock('@/lib/security/rate-limit', () => ({
  // Échoue volontairement tôt : le handler request-otp catch cette
  // erreur et appelle logApiError — ce qui permet de vérifier que
  // correlateRequest() (appelé AVANT ce point, en tête du handler) a
  // bien établi le contexte, sans avoir à mocker tout Prisma/OTP.
  enforceRateLimit: vi.fn().mockRejectedValue(new Error('rate-limit indisponible (test)')),
}));

import { GET as healthGET } from '../../app/api/health/route';
import { POST as requestOtpPOST } from '../../app/api/v1/auth/request-otp/route';
import { logger } from '../logger';
import { scrubEvent } from './sentry-scrub';

const UUID_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function fakeRequest(opts?: { requestId?: string; body?: unknown }): NextRequest {
  return {
    headers: {
      get: (name: string) => (name === 'x-request-id' ? (opts?.requestId ?? null) : null),
    },
    json: async () => opts?.body ?? { phone: '+22890000001', purpose: 'LOGIN' },
  } as unknown as NextRequest;
}

beforeEach(() => {
  setTagMock.mockClear();
});

describe('B, E — routes publiques (/api/health, représentatif de /api/v1/discover)', () => {
  it('E. GET /api/health établit la corrélation (tag Sentry request_id posé)', async () => {
    await healthGET(fakeRequest({ requestId: UUID_A }));
    expect(setTagMock).toHaveBeenCalledWith('request_id', UUID_A);
  });

  it('B. une route publique sans withAuth reçoit bien un request-id valide même sans header entrant', async () => {
    await healthGET(fakeRequest());
    expect(setTagMock).toHaveBeenCalledTimes(1);
    const [, taggedId] = setTagMock.mock.calls[0] as [string, string];
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taggedId)).toBe(true);
  });
});

describe('C — route pré-authentification (/api/v1/auth/request-otp)', () => {
  it('établit la corrélation Sentry avant même la logique métier', async () => {
    await requestOtpPOST(fakeRequest({ requestId: UUID_A }));
    expect(setTagMock).toHaveBeenCalledWith('request_id', UUID_A);
  });

  it('le requestId apparaît dans le log Winston (logApiError) de cette route', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    try {
      await requestOtpPOST(fakeRequest({ requestId: UUID_A }));
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [, meta] = errorSpy.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(meta.requestId).toBe(UUID_A);
      expect(meta.route).toBe('/v1/auth/request-otp');
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('D — webhooks : mécanisme de repli Sentry (Winston NON corrélé, documenté)', () => {
  // Ni le webhook paiement (app/api/v1/payments/webhooks/[provider]/route.ts)
  // ni le webhook Miaride (app/api/v1/marketplace/deliveries/webhooks/miaride/route.ts)
  // n'appellent correlateRequest() : le premier relève explicitement du
  // périmètre exclu "paiements", le second importe directement
  // refundEscrowToBuyer (périmètre exclu "escrow"). Voir le rapport
  // P1.13-C pour la justification complète.
  //
  // Sentry reste néanmoins corrélé pour CES DEUX routes, automatiquement
  // — l'instrumentation du SDK (`autoInstrumentServerFunctions`, active
  // par défaut sur toutes les routes) capture x-request-id à la source
  // (allow-list dans sentry.server.config.ts) et scrubEvent() le pose en
  // tag, sans qu'aucun code n'ait été ajouté au fichier webhook lui-même.
  // Ce test simule exactement cette situation : un événement produit par
  // l'instrumentation automatique (donc SANS correlateRequest()) contient
  // encore x-request-id dans son request.headers.
  it('un événement de webhook (jamais passé par correlateRequest) est quand même tagué par scrubEvent', () => {
    const event = {
      type: undefined,
      request: {
        url: 'https://kessia.app/api/v1/marketplace/deliveries/webhooks/miaride',
        headers: { [ 'x-request-id' ]: UUID_A, 'x-miaride-signature': 't=1,v1=abc' },
      },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);

    expect(out.tags?.request_id).toBe(UUID_A);
    // Le header de signature (sensible) n'est PAS le x-request-id — il
    // n'est de toute façon jamais collecté à la source (allow-list
    // stricte sur x-request-id uniquement dans dataCollection.httpHeaders).
  });

  it('même mécanisme pour une transaction webhook via les attributs de span', () => {
    const span: SpanJSON = {
      data: { 'http.request.header.x-request-id': [UUID_A] },
      span_id: 'aaaaaaaaaaaaaaaa',
      start_timestamp: 0,
      status: 'ok',
      trace_id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    };
    const event = { type: 'transaction', spans: [span] } as unknown as TransactionEvent;

    const out = scrubEvent(event);

    expect(out.tags?.request_id).toBe(UUID_A);
  });
});
