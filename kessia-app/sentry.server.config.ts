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

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

    // Conservateur au démarrage — à ajuster une fois le volume observé.
    tracesSampleRate: 0.1,

    // Coupe la collecte à la source (event.request ET attributs de span)
    // — remplace `sendDefaultPii`, absent de cette version du SDK.
    dataCollection: {
      cookies: false,
      httpHeaders: {
        request: false,
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
