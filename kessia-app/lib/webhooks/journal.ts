// ============================================================
// KESSIA — Journal des webhooks entrants (P0.3)
//
// Idempotence STRICTE au niveau transport : une ligne `WebhookEvent`
// par événement reçu, clé de dédup unique en base (contrainte
// `@@unique`), insertion atomique (create + capture de la violation de
// contrainte) — un rejeu concurrent ne peut jamais passer deux fois.
//
// Couche complémentaire à l'idempotence métier déjà en place (Ledger
// `PAYTX_<id>`, garde de statut sur `MarketplaceDelivery`) — ne la
// remplace pas, ne la modifie pas.
// ============================================================

import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export type RecordAttemptInput = {
  provider: string;
  eventType: string;
  eventKey: string;
  verified: boolean;
  ipAddress?: string;
};

export type RecordAttemptResult =
  | { duplicate: false; eventId: string }
  | { duplicate: true; eventId: string };

/**
 * Enregistre la tentative de traitement d'un événement webhook.
 * Retourne `duplicate: true` si cette `eventKey` a déjà été **traitée
 * avec succès** (`status: 'processed'`) — l'appelant ne doit alors PAS
 * ré-exécuter la logique métier. Une tentative précédente restée bloquée
 * (`processing`, ex. crash serveur) ou explicitement `failed` est
 * réouverte : c'est le comportement attendu d'un rejeu légitime par le
 * fournisseur suite à un 5xx/timeout.
 */
export async function recordWebhookAttempt(
  input: RecordAttemptInput
): Promise<RecordAttemptResult> {
  try {
    const created = await prisma.webhookEvent.create({
      data: {
        provider: input.provider,
        eventType: input.eventType,
        eventKey: input.eventKey,
        verified: input.verified,
        status: 'processing',
        ipAddress: input.ipAddress,
      },
    });
    return { duplicate: false, eventId: created.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await prisma.webhookEvent.findUnique({
        where: { eventKey: input.eventKey },
      });
      if (!existing) {
        // Ligne disparue entre l'échec de create() et cette relecture
        // (fenêtre infinitésimale) : traitée comme doublon sûr plutôt
        // que de risquer un double traitement métier.
        return { duplicate: true, eventId: input.eventKey };
      }
      if (existing.status === 'processed') {
        return { duplicate: true, eventId: existing.id };
      }
      // 'processing' (interrompu) ou 'failed' → rejeu légitime autorisé.
      await prisma.webhookEvent.update({
        where: { id: existing.id },
        data: { status: 'processing', rejectReason: null },
      });
      return { duplicate: false, eventId: existing.id };
    }
    throw e;
  }
}

/** Marque un événement comme traité avec succès. */
export async function markWebhookProcessed(eventId: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: { status: 'processed', processedAt: new Date() },
  }).catch(() => {});
}

/** Marque un événement comme échoué (le fournisseur devrait le rejouer). */
export async function markWebhookFailed(eventId: string, reason: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: { status: 'failed', rejectReason: reason.slice(0, 500) },
  }).catch(() => {});
}

/** Trace un événement rejeté (signature absente/invalide/expirée) — pas de ligne de dédup. */
export async function recordWebhookRejection(input: {
  provider: string;
  eventType: string;
  reason: string;
  ipAddress?: string;
}): Promise<void> {
  await prisma.webhookEvent.create({
    data: {
      provider: input.provider,
      eventType: input.eventType,
      eventKey: `rejected_${input.provider}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      verified: false,
      status: 'rejected',
      rejectReason: input.reason,
      ipAddress: input.ipAddress,
    },
  }).catch(() => {});
}
