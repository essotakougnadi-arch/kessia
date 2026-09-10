// ============================================================
// KESSIA — GET/POST /api/v1/cron/tontine-tick
// Tâche planifiée : (1) cotisations en retard + relances + rattrapage
// des versements (§12, §33) ; (2) relances clients échues (§7).
//
// Câblé sur un ordonnanceur (fréquence : toutes les heures) :
//  • GitHub Actions : `.github/workflows/cron.yml` (portable, POST)
//  • Vercel Cron : `kessia-app/vercel.json` (GET)
// Auth : en-tête `x-cron-secret` == `CRON_SECRET` (ou Authorization Bearer).
// Vercel Cron envoie automatiquement `Authorization: Bearer $CRON_SECRET`.
// ============================================================

import { NextRequest } from 'next/server';
import { runTontineTick } from '@/lib/tontine/orchestrator';
import { runCustomerReminders } from '@/lib/reminders/customer-reminders';
import { runDeliveryTick } from '@/lib/delivery';
import { runMarketplaceEscrowTick } from '@/lib/marketplace/escrow';
import { runRetentionPurge } from '@/lib/privacy/retention';
import { recordAudit } from '@/lib/audit/audit.service';
import { ok, unauthorized, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production'; // dev : autorisé, prod : refusé si non configuré
  const header = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return header === secret;
}

async function handle(request: NextRequest) {
  try {
    if (!authorized(request)) return unauthorized('Secret cron invalide ou absent.');

    const [tontine, reminders, deliveries, escrow, retention] = await Promise.all([
      runTontineTick(),
      runCustomerReminders().catch((e) => {
        logApiError('/v1/cron/tontine-tick:reminders', e);
        return { checked: 0, notified: 0 };
      }),
      runDeliveryTick().catch((e) => {
        logApiError('/v1/cron/tontine-tick:deliveries', e);
        return { advanced: 0 };
      }),
      runMarketplaceEscrowTick().catch((e) => {
        logApiError('/v1/cron/tontine-tick:escrow', e);
        return { released: 0 };
      }),
      runRetentionPurge().catch((e) => {
        logApiError('/v1/cron/tontine-tick:retention', e);
        return { otps: 0, sessions: 0, notifications: 0, auditLogs: 0 };
      }),
    ]);
    const result = { tontine, reminders, deliveries, escrow, retention };

    void recordAudit({
      action: 'cron.tontine_tick',
      entity: 'Tontine',
      metadata: result,
      request,
    });

    return ok(result, 'Tick exécuté (tontines + relances + livraisons + séquestre marketplace + purge rétention).');
  } catch (e) {
    logApiError('/v1/cron/tontine-tick', e);
    return serverError();
  }
}

// POST : GitHub Actions / curl.  GET : Vercel Cron (n'émet que des GET).
export const POST = handle;
export const GET = handle;
