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

/** Au-delà de cet âge, une ligne restée `processing` est considérée comme
 * un crash serveur (traitement précédent interrompu avant `markWebhookProcessed`/
 * `markWebhookFailed`) plutôt qu'un appel concurrent en cours. */
const STALE_PROCESSING_MS = 60_000;

/**
 * Enregistre la tentative de traitement d'un événement webhook.
 * Retourne `duplicate: true` si cette `eventKey` a déjà été **traitée
 * avec succès** (`status: 'processed'`) — l'appelant ne doit alors PAS
 * ré-exécuter la logique métier. Une tentative précédente restée bloquée
 * (`processing`, ex. crash serveur) ou explicitement `failed` est
 * réouverte : c'est le comportement attendu d'un rejeu légitime par le
 * fournisseur suite à un 5xx/timeout.
 *
 * P0.3 (finalisation) — course corrigée : sous 20 requêtes VRAIMENT
 * concurrentes du même événement, une seule gagne le `create()` initial
 * (contrainte `@unique` sur `eventKey`) ; les 19 autres arrivent ici via le
 * `catch` P2002. L'ancienne version réouvrait `processing` SANS CONDITION
 * — chacune des 19 relisait le statut encore `processing` (le gagnant n'a
 * pas fini) et se croyait donc légitime pour rejouer, si bien que TOUTES
 * appelaient la logique métier en parallèle (constaté empiriquement : la
 * contrainte `@unique` du Ledger absorbe le risque de double crédit, mais
 * les appels perdants remontaient une erreur Prisma brute en 400 au lieu
 * d'une réponse idempotente propre). Corrigé en deux temps :
 *   - `processing` récent (< 60 s) → un autre appel le traite
 *     PROBABLEMENT en ce moment (concurrence réelle, pas un crash) :
 *     doublon immédiat, aucune écriture tentée ;
 *   - `processing` ancien (crash probable) ou `failed` → réclamation
 *     atomique conditionnelle (`updateMany` avec la valeur actuelle en
 *     `WHERE`, réévaluée par Postgres au moment de l'écriture, pas de la
 *     lecture) : un seul appelant concurrent peut gagner la réclamation,
 *     les autres retombent sur `duplicate: true`.
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

      if (existing.status === 'processing') {
        const staleCutoff = new Date(Date.now() - STALE_PROCESSING_MS);
        if (existing.receivedAt >= staleCutoff) {
          // Encore récent : un autre appel le traite très probablement EN
          // CE MOMENT (concurrence réelle) — ne jamais retraiter en
          // parallèle, aucune écriture.
          return { duplicate: true, eventId: existing.id };
        }
        // Assez ancien pour être un crash serveur — réclamation atomique :
        // Postgres réévalue `receivedAt < staleCutoff` au moment de
        // l'écriture (verrou de ligne), donc un seul concurrent gagne.
        const claim = await prisma.webhookEvent.updateMany({
          where: { id: existing.id, status: 'processing', receivedAt: { lt: staleCutoff } },
          data: { status: 'processing', rejectReason: null, receivedAt: new Date() },
        });
        if (claim.count === 0) {
          return { duplicate: true, eventId: existing.id };
        }
        return { duplicate: false, eventId: existing.id };
      }

      // 'failed' → rejeu légitime autorisé, mais réclamation atomique pour
      // le cas où plusieurs rejeux du fournisseur arrivent en même temps.
      const claim = await prisma.webhookEvent.updateMany({
        where: { id: existing.id, status: 'failed' },
        data: { status: 'processing', rejectReason: null },
      });
      if (claim.count === 0) {
        return { duplicate: true, eventId: existing.id };
      }
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
