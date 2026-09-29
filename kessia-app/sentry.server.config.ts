// ============================================================
// KESSIA — Sentry (serveur Node), P1.13-B — safe-first
//
// Chargé par instrumentation.ts via register() quand
// NEXT_RUNTIME === 'nodejs' (routes API, Server Components, cron...).
//
// Mêmes garanties safe-first que instrumentation-client.ts : DSN lue
// uniquement depuis l'environnement, pas de Session Replay (n'existe
// pas côté serveur), `dataCollection` coupe la collecte de PII à la
// source, filtrage défensif complémentaire via lib/observability/
// sentry-scrub.ts.
// ============================================================

import * as Sentry from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from '@/lib/observability/sentry-scrub';
import { REQUEST_ID_HEADER } from '@/lib/observability/request-id';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

    // Conservateur au démarrage — à ajuster une fois le volume observé.
    tracesSampleRate: 0.1,

    // Coupe la collecte à la source (event.request ET attributs de span)
    // — remplace `sendDefaultPii`, absent de cette version du SDK.
    //
    // P1.13-C — SEULE exception : `httpHeaders.request` autorise
    // explicitement x-request-id, et RIEN d'autre (allow-list stricte,
    // pas un `true` générique) — Authorization/Cookie/etc. restent
    // bloqués à la source. C'est ce qui permet à l'instrumentation
    // automatique du SDK (`autoInstrumentServerFunctions`, active par
    // défaut sur TOUTES les routes API, pas seulement celles passant par
    // withAuth) de fournir le request-id à scrubEvent()
    // (lib/observability/sentry-scrub.ts), qui le pose comme tag
    // `request_id` puis retire le header de l'événement final — voir ce
    // fichier pour le détail.
    dataCollection: {
      cookies: false,
      httpHeaders: {
        request: { allow: [REQUEST_ID_HEADER] },
        response: false,
      },
      httpBodies: [],
      urlQueryParams: false,
      userInfo: false,
      databaseQueryData: false,
    },

    // Défense en profondeur : voir lib/observability/sentry-scrub.ts.
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}
