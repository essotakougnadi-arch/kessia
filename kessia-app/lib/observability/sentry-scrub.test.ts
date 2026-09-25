// ============================================================
// KESSIA — lib/observability/sentry-scrub.ts (P1.13-B, correction du
// gap de confidentialité) — aucune donnée sensible ne doit atteindre
// Sentry, ni sur event.request, ni sur les attributs de span.
// ============================================================

import { describe, it, expect } from 'vitest';
import type { Breadcrumb, ErrorEvent, SpanJSON, TransactionEvent } from '@sentry/core';
import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

function makeSpan(data: SpanJSON['data']): SpanJSON {
  return {
    data,
    span_id: 'aaaaaaaaaaaaaaaa',
    start_timestamp: 0,
    status: 'ok',
    trace_id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  };
}

function errorEventWithRequest(request: ErrorEvent['request']): ErrorEvent {
  return { type: undefined, request } as ErrorEvent;
}

function transactionEventWithSpans(spans: SpanJSON[]): TransactionEvent {
  return { type: 'transaction', spans } as TransactionEvent;
}

describe('scrubEvent — event.request', () => {
  it('1. retire un mot de passe présent dans event.request.data', () => {
    const out = scrubEvent(errorEventWithRequest({ data: { password: 'hunter2' } }));
    expect(out.request?.data).toBeUndefined();
  });

  it('2. retire un OTP présent dans event.request.data', () => {
    const out = scrubEvent(errorEventWithRequest({ data: { otp: '123456' } }));
    expect(out.request?.data).toBeUndefined();
  });

  it('3. retire event.request.headers.Authorization', () => {
    const out = scrubEvent(
      errorEventWithRequest({
        headers: { Authorization: 'Bearer secret-token', 'User-Agent': 'vitest' },
      })
    );
    expect(out.request?.headers?.Authorization).toBe('[Filtered]');
    // Un header non sensible n'est pas touché.
    expect(out.request?.headers?.['User-Agent']).toBe('vitest');
  });

  it('4. retire event.request.headers.Cookie', () => {
    const out = scrubEvent(errorEventWithRequest({ headers: { Cookie: 'session=abc123' } }));
    expect(out.request?.headers?.Cookie).toBe('[Filtered]');
  });
});

describe('scrubEvent — event.spans (défense en profondeur, Correction 2)', () => {
  it("5. retire http.request.body.data contenant un mot de passe sur un span", () => {
    const out = scrubEvent(
      transactionEventWithSpans([makeSpan({ 'http.request.body.data': '{"password":"hunter2"}' })])
    );
    expect(out.spans?.[0]?.data['http.request.body.data']).toBeUndefined();
  });

  it('6. retire http.request.body.data contenant un OTP sur un span', () => {
    const out = scrubEvent(
      transactionEventWithSpans([makeSpan({ 'http.request.body.data': '{"otp":"123456"}' })])
    );
    expect(out.spans?.[0]?.data['http.request.body.data']).toBeUndefined();
  });

  it('7. retire http.request.header.cookie sur un span', () => {
    const out = scrubEvent(
      transactionEventWithSpans([makeSpan({ 'http.request.header.cookie': ['session=abc123'] })])
    );
    expect(out.spans?.[0]?.data['http.request.header.cookie']).toBeUndefined();
  });

  it('retire aussi les autres attributs http.*.header.* et préserve les attributs non sensibles', () => {
    const out = scrubEvent(
      transactionEventWithSpans([
        makeSpan({
          'http.request.header.authorization': ['Bearer secret-token'],
          'http.response.header.set-cookie': ['session=abc123'],
          'http.request.method': 'POST',
          'sentry.op': 'http.server',
        }),
      ])
    );
    expect(out.spans?.[0]?.data['http.request.header.authorization']).toBeUndefined();
    expect(out.spans?.[0]?.data['http.response.header.set-cookie']).toBeUndefined();
    // Attributs non sensibles préservés.
    expect(out.spans?.[0]?.data['http.request.method']).toBe('POST');
    expect(out.spans?.[0]?.data['sentry.op']).toBe('http.server');
  });
});

describe('scrubEvent — query string / URL (Correction 3)', () => {
  it('8. rédige un paramètre otp dans la query string', () => {
    const out = scrubEvent(
      errorEventWithRequest({ url: 'https://kessia.app/verify?otp=123456&next=/home' })
    );
    const parsed = new URL(out.request!.url!);
    expect(parsed.searchParams.get('otp')).toBe('[Filtered]');
    expect(parsed.searchParams.get('next')).toBe('/home');
  });

  it('9. rédige un paramètre code dans la query string', () => {
    const out = scrubEvent(
      errorEventWithRequest({ url: 'https://kessia.app/tontine/join?code=KESS-ABC123' })
    );
    const parsed = new URL(out.request!.url!);
    expect(parsed.searchParams.get('code')).toBe('[Filtered]');
  });

  it('10. rédige un paramètre iban dans la query string', () => {
    const out = scrubEvent(
      errorEventWithRequest({ url: 'https://kessia.app/payout?iban=FR7612345987650123456789014' })
    );
    const parsed = new URL(out.request!.url!);
    expect(parsed.searchParams.get('iban')).toBe('[Filtered]');
  });

  it('event.request.query_string est toujours retiré (peut contenir les mêmes paramètres)', () => {
    const out = scrubEvent(errorEventWithRequest({ query_string: 'otp=123456' }));
    expect(out.request?.query_string).toBeUndefined();
  });
});

describe('scrubEvent — non-régression', () => {
  it('11. un événement normal non sensible est conservé', () => {
    const out = scrubEvent(
      errorEventWithRequest({
        url: 'https://kessia.app/home',
        method: 'GET',
        headers: { 'User-Agent': 'vitest', Accept: 'application/json' },
      })
    );
    expect(out.request?.url).toBe('https://kessia.app/home');
    expect(out.request?.method).toBe('GET');
    expect(out.request?.headers?.['User-Agent']).toBe('vitest');
    expect(out.request?.headers?.Accept).toBe('application/json');
  });

  it("event.user est retiré s'il est présent", () => {
    const event = { type: undefined, user: { id: '1', email: 'a@b.com' } } as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.user).toBeUndefined();
  });
});

describe('scrubBreadcrumb', () => {
  it('rédige un paramètre sensible dans breadcrumb.data.url', () => {
    const breadcrumb: Breadcrumb = {
      category: 'fetch',
      data: { url: 'https://kessia.app/verify?otp=123456' },
    };
    const out = scrubBreadcrumb(breadcrumb);
    const data = out.data as { url: string };
    const parsed = new URL(data.url);
    expect(parsed.searchParams.get('otp')).toBe('[Filtered]');
  });

  it('retire les headers sensibles dans breadcrumb.data.headers', () => {
    const breadcrumb: Breadcrumb = {
      category: 'fetch',
      data: { headers: { Authorization: 'Bearer x', Accept: 'application/json' } },
    };
    const out = scrubBreadcrumb(breadcrumb);
    const data = out.data as { headers: Record<string, string> };
    expect(data.headers.Authorization).toBe('[Filtered]');
    expect(data.headers.Accept).toBe('application/json');
  });
});
