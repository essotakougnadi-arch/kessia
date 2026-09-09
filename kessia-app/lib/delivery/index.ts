// ============================================================
// KESSIA — Orchestration livraison marketplace (ADR 0042)
//
// Flux v1 (fiche produit, mode WALLET, règlement vendeur inchangé) :
//   1. l'acheteur a déjà payé l'article (MarketplaceOrder PAID)
//   2. il demande une livraison → MarketplaceDelivery
//      - SIMULATED : débit wallet des frais + coursier fictif affecté
//      - HANDOFF   : bon préparé + lien Miaride, frais réglés hors-app
//   3. le vendeur marque « colis prêt »
//   4. SIMULATED : les statuts avancent (polling léger + cron)
//   5. l'acheteur confirme la réception
// ============================================================

import prisma from '@/lib/db/prisma';
import { createLedgerEntry } from '@/lib/ledger/ledger.service';
import { notify } from '@/lib/notifications/notify';
import type { DeliveryMode, DeliveryStatus, MarketplaceDelivery } from '@prisma/client';
import { MiarideProvider } from './miaride';
import type { DeliveryBrief, DeliveryProvider } from './types';
import { estimateFee, findZone } from './zones';

const MIARIDE = new MiarideProvider();

export function getDeliveryProvider(kind: 'MIARIDE' = 'MIARIDE'): DeliveryProvider {
  if (kind !== 'MIARIDE') throw new Error(`Fournisseur livraison inconnu : ${kind}`);
  return MIARIDE;
}

/** Délai minimal entre deux avancées d'une livraison simulée (démo). */
const SIM_STEP_MS = 25_000;

export type RequestDeliveryInput = {
  orderId: string;
  userId: string;
  mode: DeliveryMode;
  dropoffZone: string;
  dropoffAddress: string;
  recipientPhone: string;
};

export type DeliveryResult =
  | { ok: true; delivery: MarketplaceDelivery; handoffUrl?: string }
  | { ok: false; error: string; code?: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'BALANCE' | 'ZONE' | 'DISABLED' };

async function loadOrderContext(orderId: string) {
  return prisma.marketplaceOrder.findUnique({
    where: { id: orderId },
    include: {
      delivery: true,
      item: {
        select: {
          id: true, title: true, price: true, currency: true, city: true, pickupZone: true,
          sellerId: true,
          seller: { select: { firstName: true, phone: true } },
        },
      },
    },
  });
}

function briefFrom(order: NonNullable<Awaited<ReturnType<typeof loadOrderContext>>>, input: RequestDeliveryInput, dropoffLabel: string): DeliveryBrief {
  const pickupZone = findZone(order.item.pickupZone);
  const pickupLabel = [pickupZone?.label, order.item.city].filter(Boolean).join(' · ') || 'Vendeur (Grand Lomé)';
  return {
    itemTitle: order.item.title,
    itemValue: Number(order.item.price),
    currency: order.item.currency,
    pickupLabel,
    dropoffAddress: input.dropoffAddress,
    dropoffZoneLabel: dropoffLabel,
    recipientPhone: input.recipientPhone,
    sellerPhone: order.item.seller.phone,
  };
}

export async function requestDelivery(input: RequestDeliveryInput): Promise<DeliveryResult> {
  const provider = getDeliveryProvider('MIARIDE');
  if (!provider.enabled) return { ok: false, error: 'La livraison Miaride est momentanément indisponible.', code: 'DISABLED' };

  const order = await loadOrderContext(input.orderId);
  if (!order) return { ok: false, error: 'Commande introuvable.', code: 'NOT_FOUND' };
  if (order.buyerId !== input.userId) return { ok: false, error: 'Cette commande ne vous appartient pas.', code: 'FORBIDDEN' };
  if (order.mode !== 'WALLET' || order.status !== 'PAID') {
    return { ok: false, error: 'La livraison n\'est disponible que pour un achat réglé depuis le wallet.', code: 'CONFLICT' };
  }
  if (order.delivery) return { ok: false, error: 'Une livraison est déjà en cours pour cette commande.', code: 'CONFLICT' };

  const dropoff = findZone(input.dropoffZone);
  if (!dropoff) return { ok: false, error: 'Ce quartier n\'est pas couvert par Miaride pour le moment.', code: 'ZONE' };

  const fee = estimateFee(order.item.pickupZone, input.dropoffZone);
  if (!fee.covered) {
    return { ok: false, error: 'Le vendeur n\'a pas indiqué de quartier d\'enlèvement — livraison Miaride indisponible, contactez-le directement.', code: 'ZONE' };
  }

  const brief = briefFrom(order, input, dropoff.label);

  // ── HANDOFF : on prépare le bon, l'acheteur commande sur Miaride ──
  if (input.mode === 'HANDOFF') {
    const delivery = await prisma.marketplaceDelivery.create({
      data: {
        orderId: order.id,
        buyerId: input.userId,
        provider: 'MIARIDE',
        mode: 'HANDOFF',
        status: 'REQUESTED',
        pickupLabel: brief.pickupLabel,
        dropoffAddress: input.dropoffAddress,
        dropoffArea: input.dropoffZone,
        recipientPhone: input.recipientPhone,
        feeAmount: fee.amount,
        feeCurrency: 'XOF',
        etaMinutes: fee.etaMinutes,
        simulated: false,
      },
    });
    void notify({
      userId: order.item.sellerId,
      category: 'BUSINESS',
      priority: 'HIGH',
      title: 'Livraison à préparer',
      body: `« ${order.item.title} » : l'acheteur organise un coursier Miaride. Préparez le colis pour l'enlèvement à ${brief.pickupLabel}.`,
      actionUrl: '/marketplace/mine',
    });
    return { ok: true, delivery, handoffUrl: provider.buildHandoffLink(brief) };
  }

  // ── SIMULATED : débit des frais + coursier fictif ────────────────
  const wallet = await prisma.wallet.findUnique({ where: { userId: input.userId }, select: { id: true } });
  if (!wallet) return { ok: false, error: 'Wallet introuvable.', code: 'NOT_FOUND' };

  const feeRef = `DELIV-${order.id}`;
  const debit = await createLedgerEntry({
    walletId: wallet.id,
    type: 'FEE',
    direction: 'DEBIT',
    amount: fee.amount,
    description: `Livraison Miaride — ${order.item.title}`,
    referenceId: order.id,
    idempotencyKey: feeRef,
    metadata: { kind: 'marketplace_delivery', orderId: order.id, provider: 'MIARIDE' },
  });
  if (!debit.success) {
    return {
      ok: false,
      error: debit.error === 'Solde insuffisant'
        ? `Solde insuffisant pour les frais de livraison (${fee.amount.toLocaleString('fr-FR')} FCFA).`
        : 'Le paiement des frais de livraison a échoué.',
      code: 'BALANCE',
    };
  }

  const courier = provider.createSimulated(brief);
  const delivery = await prisma.marketplaceDelivery.create({
    data: {
      orderId: order.id,
      buyerId: input.userId,
      provider: 'MIARIDE',
      mode: 'SIMULATED',
      status: courier.status,
      pickupLabel: brief.pickupLabel,
      dropoffAddress: input.dropoffAddress,
      dropoffArea: input.dropoffZone,
      recipientPhone: input.recipientPhone,
      feeAmount: fee.amount,
      feeCurrency: 'XOF',
      feeLedgerRef: feeRef,
      etaMinutes: fee.etaMinutes,
      providerRef: courier.providerRef,
      trackingUrl: courier.trackingUrl,
      courierName: courier.courierName,
      simulated: true,
    },
  });

  void notify({
    userId: order.item.sellerId,
    category: 'BUSINESS',
    priority: 'HIGH',
    title: 'Colis à préparer pour Miaride',
    body: `« ${order.item.title} » : un coursier va passer récupérer le colis à ${brief.pickupLabel}. Marquez-le « prêt » dès que possible.`,
    actionUrl: '/marketplace/mine',
  });

  return { ok: true, delivery };
}

/** Le vendeur confirme que le colis est prêt à être enlevé. */
export async function markSellerReady(deliveryId: string, userId: string): Promise<DeliveryResult> {
  const d = await prisma.marketplaceDelivery.findUnique({
    where: { id: deliveryId },
    include: { order: { include: { item: { select: { sellerId: true, title: true } } } } },
  });
  if (!d) return { ok: false, error: 'Livraison introuvable.', code: 'NOT_FOUND' };
  if (d.order.item.sellerId !== userId) return { ok: false, error: 'Action réservée au vendeur.', code: 'FORBIDDEN' };
  if (d.sellerReadyAt) return { ok: true, delivery: d };
  if (d.status === 'DELIVERED' || d.status === 'CANCELLED') {
    return { ok: false, error: 'Cette livraison est terminée.', code: 'CONFLICT' };
  }
  const updated = await prisma.marketplaceDelivery.update({
    where: { id: d.id },
    data: { sellerReadyAt: new Date() },
  });
  void notify({
    userId: d.buyerId,
    category: 'BUSINESS',
    priority: 'NORMAL',
    title: 'Colis prêt',
    body: `Le vendeur a préparé « ${d.order.item.title} ». Le coursier va l'enlever.`,
    actionUrl: '/marketplace/mine',
  });
  return { ok: true, delivery: updated };
}

/** Fait avancer une livraison simulée d'une étape si le délai est écoulé. */
export async function advanceSimulatedDelivery(deliveryId: string): Promise<DeliveryResult> {
  const d = await prisma.marketplaceDelivery.findUnique({
    where: { id: deliveryId },
    include: { order: { include: { item: { select: { title: true } } } } },
  });
  if (!d) return { ok: false, error: 'Livraison introuvable.', code: 'NOT_FOUND' };
  if (!d.simulated || d.mode !== 'SIMULATED') return { ok: true, delivery: d };
  if (Date.now() - d.updatedAt.getTime() < SIM_STEP_MS) return { ok: true, delivery: d };

  const provider = getDeliveryProvider('MIARIDE');
  const next = provider.nextStatus(d.status, d.sellerReadyAt !== null);
  if (!next) return { ok: true, delivery: d };

  const updated = await prisma.marketplaceDelivery.update({
    where: { id: d.id },
    data: {
      status: next,
      ...(next === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
    },
  });

  if (next === 'PICKED_UP') {
    void notify({ userId: d.buyerId, category: 'BUSINESS', priority: 'NORMAL', title: 'Colis récupéré', body: `Le coursier a récupéré « ${d.order.item.title} » et se met en route.`, actionUrl: '/marketplace/mine' });
  } else if (next === 'DELIVERED') {
    void notify({ userId: d.buyerId, category: 'BUSINESS', priority: 'HIGH', title: 'Colis livré', body: `« ${d.order.item.title} » a été livré. Confirmez la réception.`, actionUrl: '/marketplace/mine' });
  }
  return { ok: true, delivery: updated };
}

/** L'acheteur confirme avoir reçu le colis. */
export async function confirmDelivered(deliveryId: string, userId: string): Promise<DeliveryResult> {
  const d = await prisma.marketplaceDelivery.findUnique({ where: { id: deliveryId } });
  if (!d) return { ok: false, error: 'Livraison introuvable.', code: 'NOT_FOUND' };
  if (d.buyerId !== userId) return { ok: false, error: 'Action réservée à l\'acheteur.', code: 'FORBIDDEN' };
  if (d.status === 'CANCELLED') return { ok: false, error: 'Cette livraison a été annulée.', code: 'CONFLICT' };
  if (d.status === 'DELIVERED') return { ok: true, delivery: d };
  const updated = await prisma.marketplaceDelivery.update({
    where: { id: d.id },
    data: { status: 'DELIVERED', deliveredAt: new Date() },
  });
  return { ok: true, delivery: updated };
}

/** L'acheteur annule avant l'enlèvement — les frais simulés sont remboursés. */
export async function cancelDelivery(deliveryId: string, userId: string): Promise<DeliveryResult> {
  const d = await prisma.marketplaceDelivery.findUnique({
    where: { id: deliveryId },
    include: { order: { include: { item: { select: { sellerId: true, title: true } } } } },
  });
  if (!d) return { ok: false, error: 'Livraison introuvable.', code: 'NOT_FOUND' };
  if (d.buyerId !== userId) return { ok: false, error: 'Action réservée à l\'acheteur.', code: 'FORBIDDEN' };
  if (d.status === 'DELIVERED' || d.status === 'CANCELLED') {
    return { ok: false, error: 'Cette livraison ne peut plus être annulée.', code: 'CONFLICT' };
  }
  if (d.status === 'PICKED_UP' || d.status === 'IN_TRANSIT') {
    return { ok: false, error: 'Le coursier a déjà récupéré le colis — annulation impossible.', code: 'CONFLICT' };
  }

  // Remboursement des frais si prélevés (mode simulé).
  if (d.feeLedgerRef && d.simulated) {
    const wallet = await prisma.wallet.findUnique({ where: { userId }, select: { id: true } });
    if (wallet) {
      await createLedgerEntry({
        walletId: wallet.id,
        type: 'REFUND',
        direction: 'CREDIT',
        amount: Number(d.feeAmount),
        description: `Remboursement livraison — ${d.order.item.title}`,
        referenceId: d.orderId,
        idempotencyKey: `DELIV-REFUND-${d.id}`,
        metadata: { kind: 'marketplace_delivery_refund', deliveryId: d.id },
      });
    }
  }

  const updated = await prisma.marketplaceDelivery.update({
    where: { id: d.id },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  void notify({
    userId: d.order.item.sellerId,
    category: 'BUSINESS',
    priority: 'NORMAL',
    title: 'Livraison annulée',
    body: `L'acheteur a annulé la livraison de « ${d.order.item.title} ».`,
    actionUrl: '/marketplace/mine',
  });
  return { ok: true, delivery: updated };
}

/** HANDOFF : l'acheteur colle son code de suivi Miaride. */
export async function attachTracking(deliveryId: string, userId: string, code: string): Promise<DeliveryResult> {
  const provider = getDeliveryProvider('MIARIDE');
  const d = await prisma.marketplaceDelivery.findUnique({ where: { id: deliveryId } });
  if (!d) return { ok: false, error: 'Livraison introuvable.', code: 'NOT_FOUND' };
  if (d.buyerId !== userId) return { ok: false, error: 'Action réservée à l\'acheteur.', code: 'FORBIDDEN' };
  if (d.mode !== 'HANDOFF') return { ok: false, error: 'Non applicable à cette livraison.', code: 'CONFLICT' };
  const ref = code.trim().toUpperCase().slice(0, 40);
  if (ref.length < 3) return { ok: false, error: 'Code de suivi invalide.', code: 'CONFLICT' };
  const updated = await prisma.marketplaceDelivery.update({
    where: { id: d.id },
    data: { providerRef: ref, trackingUrl: provider.trackingUrlFor(ref), status: 'COURIER_ASSIGNED' },
  });
  return { ok: true, delivery: updated };
}

/**
 * Rattrapage (cron) : avance toutes les livraisons simulées non
 * terminales dont le dernier changement est assez ancien.
 */
export async function runDeliveryTick(): Promise<{ advanced: number }> {
  const cutoff = new Date(Date.now() - SIM_STEP_MS);
  const pending = await prisma.marketplaceDelivery.findMany({
    where: {
      simulated: true,
      mode: 'SIMULATED',
      status: { in: ['REQUESTED', 'COURIER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] as DeliveryStatus[] },
      updatedAt: { lt: cutoff },
    },
    select: { id: true },
    take: 100,
  });
  let advanced = 0;
  for (const p of pending) {
    const r = await advanceSimulatedDelivery(p.id).catch(() => null);
    if (r?.ok && r.delivery.status !== 'REQUESTED') advanced += 1;
  }
  return { advanced };
}
