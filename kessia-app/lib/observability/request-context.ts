// ============================================================
// KESSIA — Contexte de corrélation request-id (P1.13-C)
//
// Fichier Node-only (importe node:async_hooks) — NE JAMAIS importer
// depuis middleware.ts ou un fichier chargé côté edge
// (sentry.edge.config.ts, instrumentation-client.ts). Aucune route API
// de KESSIA ne déclare `runtime = 'edge'` (vérifié) : ce module n'est
// utilisé que côté Node, via lib/auth/middleware.ts (withAuth).
//
// middleware.ts (edge) résout/valide déjà le request-id et le pose sur
// le header x-request-id de la requête transmise au serveur Node — ce
// module ne le GÉNÈRE jamais lui-même en priorité, il consomme ce
// header côté Node (avec revalidation défensive via resolveRequestId,
// au cas où ce code s'exécuterait sans être passé par le middleware —
// ex. un test qui invoque une route directement).
//
// Portée : withAuth est le point d'entrée partagé par la quasi-totalité
// des routes authentifiées (wallet/ledger/paiements/KYC/RBAC via
// requireAdmin → withAuthAndRole → withAuth). Les routes
// pré-authentification (login/register/request-otp/refresh) et les
// webhooks (paiement, Miaride) ne passent PAS par withAuth et n'ont
// donc PAS de requestId corrélé automatiquement — limitation connue,
// documentée dans le rapport P1.13-C plutôt que résolue en touchant
// chacune de ces routes individuellement.
// ============================================================

import { AsyncLocalStorage } from 'node:async_hooks';
import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

const requestIdStorage = new AsyncLocalStorage<string>();

/** Lit le request-id actif pour la requête en cours (`undefined` hors contexte). */
export function getCurrentRequestId(): string | undefined {
  return requestIdStorage.getStore();
}

/**
 * Établit le contexte de corrélation pour le reste du traitement de la
 * requête en cours (Winston via getCurrentRequestId(), tag Sentry).
 *
 * `enterWith` (pas `run`) : ce point est appelé UNE fois, en tête de
 * withAuth — pas comme wrapper englobant tout le handler. `enterWith`
 * fait persister le store pour le reste de l'exécution asynchrone en
 * cours (comportement documenté de node:async_hooks), donc pour le
 * reste du handler de route appelant withAuth, sans avoir à
 * l'envelopper explicitement. Isolation par requête garantie par
 * async_hooks lui-même : chaque invocation de fonction async démarre
 * son propre contexte, jamais partagé entre deux requêtes concurrentes
 * traitées via des appels distincts à withAuth.
 *
 * Sentry.setTag('request_id', ...) UNIQUEMENT — jamais setContext ni
 * setExtra ici, et rien d'autre que l'UUID déjà validé n'est transmis
 * (aucun header, cookie, corps de requête, query, donnée KYC/financière
 * ou secret). Le tag est écrit sur le scope courant : côté Node, le SDK
 * Sentry isole ce scope par requête (mécanisme déjà vérifié lors de
 * l'audit P1.13-B — requestDataIntegration lit
 * currentScopes.getIsolationScope() par requête), donc aucun risque de
 * fuite d'un request_id vers les événements d'une autre requête
 * concurrente.
 */
export function correlateRequest(request: NextRequest): string {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  requestIdStorage.enterWith(requestId);
  Sentry.setTag('request_id', requestId);
  return requestId;
}
