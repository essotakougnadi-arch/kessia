// ============================================================
// KESSIA — Sentry (edge runtime), P1.13-B — safe-first
//
// Chargé par instrumentation.ts via register() quand
// NEXT_RUNTIME === 'edge' (middleware.ts, routes déclarées en edge).
//
// Mêmes garanties safe-first que les deux autres fichiers d'init. Le
// runtime edge n'a pas accès à l'API Node complète — options identiques,
// pas de fonctionnalité supplémentaire activée. `dataCollection` coupe
// la collecte de PII à la source, filtrage défensif complémentaire via
// lib/observability/sentry-scrub.ts.
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
