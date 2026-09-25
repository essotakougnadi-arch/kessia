// ============================================================
// KESSIA — Filtrage Sentry avant envoi (P1.13-B, safe-first)
//
// Partagé par instrumentation-client.ts / sentry.server.config.ts /
// sentry.edge.config.ts pour éviter de tripler la même logique.
//
// Règle absolue : aucun mot de passe, OTP, token, secret, clé API,
// document KYC ou contenu financier sensible ne doit atteindre Sentry.
//
// Défense en profondeur : ce module reste le dernier rempart même si
// `dataCollection` (configuré dans les 3 fichiers d'init) était un jour
// mal réglé ou contourné par une intégration tierce future — il ne doit
// donc jamais supposer que les champs qu'il traite sont déjà vides.
// - corps de requête/réponse : jamais capturés (event.request ET spans)
// - headers Authorization/Cookie : toujours retirés (event.request ET
//   attributs de span `http.request.header.*`/`http.response.header.*`)
// - query params sensibles (otp/code/pin/iban/cvv/...) : rédigés dans
//   l'URL, jamais transmis tels quels
// - données utilisateur (event.user) : jamais envoyées par défaut
// - reste des données libres (extra/contexts/breadcrumbs/spans) : passées
//   par `redactDeep()`, la même rédaction que le logger Winston applique
//   déjà — cohérence entre les deux canaux d'observabilité.
//
// Import direct depuis lib/security/redact.ts (PAS depuis lib/logger.ts)
// — logger.ts charge Winston, qui dépend de modules Node-only (fs/os)
// absents du runtime edge ; ce fichier est importé par
// sentry.edge.config.ts et doit rester edge-safe.
// ============================================================

import type { Breadcrumb, ErrorEvent, SpanJSON, TransactionEvent } from '@sentry/core';
import { redactDeep } from '@/lib/security/redact';

const FILTERED = '[Filtered]';

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-csrf-token',
]);

// Correction 3 — noms de paramètres de requête/URL sensibles. Comparaison
// insensible à la casse (toujours via `.toLowerCase()` avant lookup).
const SENSITIVE_PARAM_NAMES = new Set([
  'otp',
  'code',
  'pin',
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'iban',
  'cvv',
  'card',
  'account',
  'phone',
]);

function stripSensitiveHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!headers) return headers;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? FILTERED : value;
  }
  return out;
}

/** Rédige les valeurs des query params sensibles d'une URL — préserve le reste (chemin, host, params non sensibles). */
function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const questionMarkIndex = url.indexOf('?');
  if (questionMarkIndex === -1) return url;
  try {
    const base = url.slice(0, questionMarkIndex);
    const params = new URLSearchParams(url.slice(questionMarkIndex + 1));
    for (const key of Array.from(params.keys())) {
      if (SENSITIVE_PARAM_NAMES.has(key.toLowerCase())) {
        params.set(key, FILTERED);
      }
    }
    return `${base}?${params.toString()}`;
  } catch {
    // URL malformée : ne jamais faire échouer l'envoi de l'événement pour
    // ça — on la laisse passer non modifiée plutôt que de planter ici.
    return url;
  }
}

// Attributs de span posés par le SDK pour le corps/les headers HTTP
// (nommage vérifié dans le code source installé de @sentry/core :
// utils/request.js `httpHeadersToSpanAttributes` — préfixe
// `http.<request|response>.header.` — et integrations/requestdata.js
// `addNormalizedRequestDataToSpan` — clé `http.request.body.data`).
const SPAN_BODY_ATTRIBUTE_PATTERN = /^http\.(request|response)\.body\./i;
const SPAN_HEADER_ATTRIBUTE_PATTERN = /^http\.(request|response)\.header\./i;
const SPAN_URL_ATTRIBUTE_NAMES = new Set(['url.full', 'url.query']);

/** Retire/rédige les attributs sensibles d'un span (corps, headers, URL) — défensif même si `dataCollection` était mal configuré. */
function scrubSpan(span: SpanJSON): SpanJSON {
  if (!span.data) return span;
  const data: Record<string, unknown> = { ...span.data };
  for (const key of Object.keys(data)) {
    if (SPAN_BODY_ATTRIBUTE_PATTERN.test(key) || SPAN_HEADER_ATTRIBUTE_PATTERN.test(key)) {
      delete data[key];
      continue;
    }
    if (SPAN_URL_ATTRIBUTE_NAMES.has(key) && typeof data[key] === 'string') {
      data[key] = sanitizeUrl(data[key] as string);
    }
  }
  // Passe défensive finale sur ce qu'il reste (rédaction par motif,
  // comme le reste de l'événement) — aucune valeur sensible connue ne
  // doit survivre même sous un nom d'attribut imprévu.
  span.data = redactDeep(data) as SpanJSON['data'];
  return span;
}

type ScrubbableEvent = ErrorEvent | TransactionEvent;

/** `beforeSend` / `beforeSendTransaction` — même traitement pour les deux. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.request) {
    // Jamais le corps de requête (peut contenir mot de passe, OTP, IBAN...).
    event.request.data = undefined;
    // Jamais les cookies bruts (contiennent les tokens de session).
    event.request.cookies = undefined;
    event.request.headers = stripSensitiveHeaders(event.request.headers);
    // Jamais la query string brute (mêmes paramètres sensibles possibles).
    event.request.query_string = undefined;
    event.request.url = sanitizeUrl(event.request.url);
  }

  // Ce code n'appelle jamais Sentry.setUser() — si une donnée utilisateur
  // apparaît malgré tout (dépendance tierce, future évolution), elle est
  // retirée ici plutôt que de compter uniquement sur la configuration
  // `dataCollection.userInfo: false`.
  if (event.user) {
    event.user = undefined;
  }

  if (event.extra) {
    event.extra = redactDeep(event.extra);
  }
  if (event.contexts) {
    event.contexts = redactDeep(event.contexts);
  }

  // Défense en profondeur (Correction 2) : les transactions (spans) ne
  // passent pas par `event.request` — le corps/les headers HTTP peuvent
  // être attachés directement sur des attributs de span, même quand
  // `dataCollection` est correctement configuré à false (protection
  // contre une future mauvaise configuration ou une intégration tierce).
  if (event.spans) {
    event.spans = event.spans.map(scrubSpan);
  }

  return event;
}

/** `beforeBreadcrumb` — retire les headers/URL sensibles puis rédacte le reste. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.data && typeof breadcrumb.data === 'object') {
    const data = breadcrumb.data as Record<string, unknown>;
    if (data.headers && typeof data.headers === 'object') {
      data.headers = stripSensitiveHeaders(data.headers as Record<string, string>);
    }
    // `sanitizeUrl` doit avoir le dernier mot sur `url` : appliqué AVANT
    // `redactDeep`, son résultat (qui contient encore littéralement
    // `otp=...`/`code=...` juste masqués) serait re-capturé par la même
    // regex que `redactDeep` applique au reste de l'objet, écrasant le
    // marqueur `[Filtered]` par `***` — inoffensif mais incohérent.
    const sanitizedUrl = typeof data.url === 'string' ? sanitizeUrl(data.url) : undefined;
    breadcrumb.data = redactDeep(data);
    if (sanitizedUrl !== undefined) {
      (breadcrumb.data as Record<string, unknown>).url = sanitizedUrl;
    }
  }
  if (typeof breadcrumb.message === 'string') {
    breadcrumb.message = redactDeep(breadcrumb.message);
  }
  return breadcrumb;
}
