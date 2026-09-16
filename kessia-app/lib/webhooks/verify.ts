// ============================================================
// KESSIA — Vérification des webhooks entrants (P0.3, cahier §44)
//
// Format de signature : `t=<horodatage unix en secondes>,v1=<HMAC-SHA256
// hex de "${t}.${rawBody}">` (pattern éprouvé, cf. Stripe/GitHub). Le
// HMAC porte sur le corps ET l'horodatage : une signature volée ne peut
// pas être rejouée en dehors de la fenêtre de tolérance, même si le
// corps est identique (protection anti-rejeu).
//
// Comportement fail-closed :
//   - secret absent + NODE_ENV=production → REJET (aucun fournisseur
//     réel n'est configuré tant que le secret n'est pas posé — ADR 0005).
//   - secret absent hors production → accepté mais marqué `verified:
//     false`, pour ne pas bloquer le développement/démo locale.
//   - secret présent → signature ET horodatage obligatoires et vérifiés.
//
// Réplique le pattern déjà en place et approuvé pour
// `app/api/v1/cron/tontine-tick/route.ts::authorized`.
// ============================================================

import crypto from 'crypto';

export type WebhookRejectReason =
  | 'missing_secret_in_production'
  | 'missing_signature'
  | 'malformed_signature'
  | 'timestamp_out_of_range'
  | 'bad_signature';

export type WebhookVerifyResult =
  | { ok: true; verified: boolean; timestamp: Date | null }
  | { ok: false; reason: WebhookRejectReason };

const SIGNATURE_RE = /^t=(\d+),v1=([0-9a-f]+)$/i;

/**
 * Vérifie la signature d'un webhook entrant.
 *
 * @param rawBody corps brut de la requête (avant tout JSON.parse)
 * @param signatureHeader valeur de l'en-tête de signature (`t=…,v1=…`)
 * @param secret secret partagé pour ce fournisseur (`process.env.XXX_WEBHOOK_SECRET`)
 * @param toleranceMs fenêtre de tolérance anti-rejeu (défaut 5 min)
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
  toleranceMs = 5 * 60_000
): WebhookVerifyResult {
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, reason: 'missing_secret_in_production' };
    }
    // Dev/test sans secret configuré : comportement historique préservé
    // (accepté, non vérifié, tracé par l'appelant dans WebhookEvent).
    return { ok: true, verified: false, timestamp: null };
  }

  if (!signatureHeader) {
    return { ok: false, reason: 'missing_signature' };
  }

  const match = SIGNATURE_RE.exec(signatureHeader.trim());
  if (!match) {
    return { ok: false, reason: 'malformed_signature' };
  }

  const [, tsRaw, signatureHex] = match;
  const timestampSec = Number(tsRaw);
  const timestamp = new Date(timestampSec * 1000);

  if (!Number.isFinite(timestampSec) || Math.abs(Date.now() - timestamp.getTime()) > toleranceMs) {
    return { ok: false, reason: 'timestamp_out_of_range' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${tsRaw}.${rawBody}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(signatureHex, 'hex');
  const matches =
    expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf);

  if (!matches) {
    return { ok: false, reason: 'bad_signature' };
  }

  return { ok: true, verified: true, timestamp };
}

/** Construit l'en-tête de signature — utilisé par les tests (simule l'expéditeur). */
export function signWebhookPayload(rawBody: string, secret: string, timestamp = Date.now()): string {
  const tsSec = Math.floor(timestamp / 1000);
  const hmac = crypto.createHmac('sha256', secret).update(`${tsSec}.${rawBody}`).digest('hex');
  return `t=${tsSec},v1=${hmac}`;
}
