import { describe, it, expect, afterEach, vi } from 'vitest';
import { verifyWebhookSignature, signWebhookPayload } from './verify';

const SECRET = 'test-secret-p0-3';
const BODY = JSON.stringify({ event: 'payment.completed', reference: 'TX-1' });

describe('verifyWebhookSignature — secret configuré', () => {
  it('accepte une signature valide et récente', () => {
    const sig = signWebhookPayload(BODY, SECRET);
    const result = verifyWebhookSignature(BODY, sig, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.verified).toBe(true);
  });

  it('rejette une signature absente', () => {
    const result = verifyWebhookSignature(BODY, null, SECRET);
    expect(result).toEqual({ ok: false, reason: 'missing_signature' });
  });

  it('rejette un en-tête mal formé', () => {
    const result = verifyWebhookSignature(BODY, 'not-the-right-format', SECRET);
    expect(result).toEqual({ ok: false, reason: 'malformed_signature' });
  });

  it('rejette une signature dont le HMAC ne correspond pas', () => {
    const sig = signWebhookPayload(BODY, 'wrong-secret');
    const result = verifyWebhookSignature(BODY, sig, SECRET);
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejette si le corps a été altéré après signature (intégrité)', () => {
    const sig = signWebhookPayload(BODY, SECRET);
    const tampered = BODY.replace('TX-1', 'TX-2');
    const result = verifyWebhookSignature(tampered, sig, SECRET);
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejette une signature valide mais hors fenêtre de tolérance (anti-rejeu)', () => {
    const oldTimestamp = Date.now() - 10 * 60_000; // 10 min, > tolérance 5 min
    const sig = signWebhookPayload(BODY, SECRET, oldTimestamp);
    const result = verifyWebhookSignature(BODY, sig, SECRET);
    expect(result).toEqual({ ok: false, reason: 'timestamp_out_of_range' });
  });

  it('accepte une signature en limite basse de la fenêtre de tolérance', () => {
    const recentEnough = Date.now() - 4 * 60_000; // 4 min < 5 min
    const sig = signWebhookPayload(BODY, SECRET, recentEnough);
    const result = verifyWebhookSignature(BODY, sig, SECRET);
    expect(result.ok).toBe(true);
  });

  it('respecte une tolérance personnalisée', () => {
    const sig = signWebhookPayload(BODY, SECRET, Date.now() - 30_000);
    expect(verifyWebhookSignature(BODY, sig, SECRET, 10_000).ok).toBe(false);
  });

  it('rejette un horodatage futur hors tolérance (horloge expéditeur en avance)', () => {
    const future = Date.now() + 10 * 60_000;
    const sig = signWebhookPayload(BODY, SECRET, future);
    const result = verifyWebhookSignature(BODY, sig, SECRET);
    expect(result).toEqual({ ok: false, reason: 'timestamp_out_of_range' });
  });
});

describe('verifyWebhookSignature — secret absent', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    vi.stubEnv('NODE_ENV', ORIGINAL_ENV ?? 'test');
  });

  it('rejette (fail-closed) en production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const result = verifyWebhookSignature(BODY, null, undefined);
    expect(result).toEqual({ ok: false, reason: 'missing_secret_in_production' });
  });

  it('accepte mais marque non-vérifié hors production (dev/test)', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const result = verifyWebhookSignature(BODY, null, undefined);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.verified).toBe(false);
  });
});

describe('signWebhookPayload', () => {
  it('produit un en-tête au format t=<secondes>,v1=<hex>', () => {
    const sig = signWebhookPayload(BODY, SECRET);
    expect(sig).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });
});
