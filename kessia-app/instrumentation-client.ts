// ============================================================
// KESSIA — Sentry (client), P1.13-B — safe-first
//
// Convention Next.js 15.3+ : ce fichier est auto-détecté et exécuté
// avant l'hydratation React (aucun câblage manuel requis).
//
// Safe-first :
// - DSN lue UNIQUEMENT depuis NEXT_PUBLIC_SENTRY_DSN (jamais codée en
//   dur) ; absente → Sentry.init() n'est même pas appelé, l'app tourne
//   normalement sans télémétrie.
// - Session Replay : NON intégré (pas de replayIntegration()).
// - `sendDefaultPii` n'existe pas comme option dans cette version du SDK
//   (vérifié dans les types installés) — son équivalent ici est
//   `dataCollection`, explicitement mis à `false`/`[]` partout ci-dessous :
//   aucun cookie, header, corps de requête/réponse, query param, donnée
//   utilisateur ou requête base de données n'est collecté à la source.
// - tracesSampleRate conservateur au démarrage (10 %).
// - beforeSend/beforeBreadcrumb : voir lib/observability/sentry-scrub.ts
//   (défense en profondeur — retrait headers Authorization/Cookie, corps
//   de requête, données utilisateur, y compris sur les spans, au cas où
//   `dataCollection` serait un jour mal configuré ; rédaction du reste
//   comme le logger Winston).
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

    // Session Replay désactivé (aucune intégration replay ajoutée, aucun
    // taux d'échantillonnage de replay configuré).

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
