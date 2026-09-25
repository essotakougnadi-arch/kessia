// ============================================================
// KESSIA — Instrumentation Next.js (P1.13-B)
//
// Convention officielle Next.js/Sentry pour charger sentry.server.config
// et sentry.edge.config selon le runtime — sans ce fichier, ces deux
// fichiers ne sont jamais exécutés (ils ne s'auto-chargent pas).
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
// ============================================================

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
