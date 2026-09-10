// ============================================================
// KESSIA — Séquestre Marketplace « paiement à la réception » (ADR 0045)
//
// Pour un article dont le vendeur a choisi le règlement ON_DELIVERY,
// l'achat WALLET envoie les fonds de l'acheteur vers un séquestre
// plateforme (`WalletKind.MARKETPLACE_ESCROW`, une seule instance) au
// lieu du wallet du vendeur. Le vendeur est réglé :
//   • quand l'acheteur confirme la réception (chemin normal), ou
//   • automatiquement N jours après l'achat sans annulation (filet).
// L'acheteur est remboursé si la livraison est annulée avant enlèvement
// ou si le colis n'est jamais remis.
//
// Mirroir volontaire du séquestre de tontine (ADR 0031) : `postDoubleEntry`
// + `SELECT FOR UPDATE`, idempotence par clé.
// ============================================================

import prisma from '@/lib/db/prisma';
import { postDoubleEntry } from '@/lib/ledger/ledger.service';
import { notify } from '@/lib/notifications/notify';

/** Jours après l'achat au bout desquels le séquestre est libéré d'office. */
export const ESCROW_AUTO_RELEASE_DAYS = 14;

/** Récupère (ou crée) l'unique wallet séquestre marketplace. */
export async function getMarketplaceEscrowWallet(): Promise<{ id: string; currency: string }> {
  const existing = await prisma.wallet.findFirst({
    where: { kind: 'MARKETPLACE_ESCROW' },
    select: { id: true, currency: true },
  });
  if (existing) return existing;
  const created = await prisma.wallet.create({
    data: { kind: 'MARKETPLACE_ESCROW', currency: 'XOF', userId: null, tontineId: null },
    select: { id: true, currency: true },
  });
  return created;
}

type SettleOutcome =
  | { ok: true; settled: number; alreadySettled: boolean }
  | { ok: false; error: string };

/**
 * Libère le séquestre vers le vendeur pour une commande ON_DELIVERY en
 * attente. Idempotent : deux appels ne versent qu'une fois.
 */
export async function releaseEscrowToSeller(orderId: string, reason: 'buyer_confirmed' | 'auto_release'): Promise<SettleOutcome> {
  const order = await prisma.marketplaceOrder.findUnique({
    where: { id: orderId },
    include: {
      item: { select: { title: true, sellerId: true, seller: { select: { wallet: { select: { id: true } } } } } },
    },
  });
  if (!order) return { ok: false, error: 'Commande introuvable.' };
  if (order.settlement !== 'ON_DELIVERY') return { ok: true, settled: 0, alreadySettled: true };
  if (order.status === 'REFUNDED' || order.status === 'CANCELLED') {
    return { ok: false, error: 'Commande annulée ou remboursée — pas de versement.' };
  }
  if (order.status === 'PAID' && order.settledAt) return { ok: true, settled: 0, alreadySettled: true };

  const sellerWalletId = order.item.seller.wallet?.id;
  if (!sellerWalletId) return { ok: false, error: 'Wallet vendeur introuvable.' };
  const escrow = await getMarketplaceEscrowWallet();
  const amount = Number(order.amount);
  const idem = `MKT_SETTLE_${order.id}`;

  const led = await postDoubleEntry({
    fromWalletId: escrow.id,
    toWalletId: sellerWalletId,
    type: 'SALE_PAYMENT',
    amount,
    description: `Vente marketplace (séquestre libéré) — ${order.item.title}`,
    referenceId: order.id,
    idempotencyKey: idem,
    metadata: { kind: 'marketplace_settlement', orderId: order.id, reason },
  });
  if (!led.success) return { ok: false, error: led.error ?? 'Le versement au vendeur a échoué.' };

  await prisma.marketplaceOrder.update({
    where: { id: order.id },
    data: { status: 'PAID', settlementLedgerRef: idem, settledAt: new Date() },
  });

  void notify({
    userId: order.item.sellerId,
    category: 'PAYMENT',
    priority: 'HIGH',
    title: 'Vente réglée 🎉',
    body:
      reason === 'auto_release'
        ? `« ${order.item.title} » : le séquestre a été libéré automatiquement (${amount.toLocaleString('fr-FR')} FCFA).`
        : `L'acheteur a confirmé la réception de « ${order.item.title} ». ${amount.toLocaleString('fr-FR')} FCFA versés.`,
    actionUrl: '/marketplace/mine',
  });
  return { ok: true, settled: amount, alreadySettled: false };
}

/** Rembourse l'acheteur depuis le séquestre (livraison annulée / non remise). */
export async function refundEscrowToBuyer(orderId: string, reason: string): Promise<SettleOutcome> {
  const order = await prisma.marketplaceOrder.findUnique({
    where: { id: orderId },
    include: {
      buyer: { select: { wallet: { select: { id: true } } } },
      item: { select: { title: true, id: true, sellerId: true } },
    },
  });
  if (!order) return { ok: false, error: 'Commande introuvable.' };
  if (order.settlement !== 'ON_DELIVERY') return { ok: true, settled: 0, alreadySettled: true };
  if (order.status === 'PAID' && order.settledAt) return { ok: false, error: 'Vendeur déjà réglé — remboursement impossible.' };
  if (order.status === 'REFUNDED') return { ok: true, settled: 0, alreadySettled: true };

  const buyerWalletId = order.buyer.wallet?.id;
  if (!buyerWalletId) return { ok: false, error: 'Wallet acheteur introuvable.' };
  const escrow = await getMarketplaceEscrowWallet();
  const amount = Number(order.amount);
  const idem = `MKT_ESCROW_REFUND_${order.id}`;

  const led = await postDoubleEntry({
    fromWalletId: escrow.id,
    toWalletId: buyerWalletId,
    type: 'REFUND',
    amount,
    description: `Remboursement marketplace (séquestre) — ${order.item.title}`,
    referenceId: order.id,
    idempotencyKey: idem,
    metadata: { kind: 'marketplace_escrow_refund', orderId: order.id, reason },
  });
  if (!led.success) return { ok: false, error: led.error ?? 'Le remboursement a échoué.' };

  await prisma.$transaction([
    prisma.marketplaceOrder.update({ where: { id: order.id }, data: { status: 'REFUNDED' } }),
    // On remet l'article en vente : le stock avait été décrémenté à l'achat.
    prisma.marketplaceItem.update({
      where: { id: order.item.id },
      data: { stock: { increment: 1 }, status: 'ACTIVE' },
    }),
  ]);

  void notify({
    userId: order.buyerId,
    category: 'PAYMENT',
    priority: 'HIGH',
    title: 'Achat remboursé',
    body: `« ${order.item.title} » : ${amount.toLocaleString('fr-FR')} FCFA ont été recrédités sur votre wallet.`,
    actionUrl: '/marketplace/mine',
  });
  return { ok: true, settled: amount, alreadySettled: false };
}

/**
 * Filet (cron) : libère vers le vendeur tout séquestre en attente depuis
 * plus de ESCROW_AUTO_RELEASE_DAYS, sauf si une livraison est en cours
 * mais pas encore livrée (on laisse le temps au parcours normal).
 */
export async function runMarketplaceEscrowTick(now = Date.now()): Promise<{ released: number }> {
  const cutoff = new Date(now - ESCROW_AUTO_RELEASE_DAYS * 86_400_000);
  const pending = await prisma.marketplaceOrder.findMany({
    where: {
      settlement: 'ON_DELIVERY',
      status: 'PENDING_SETTLEMENT',
      createdAt: { lt: cutoff },
      OR: [{ delivery: null }, { delivery: { status: { in: ['DELIVERED', 'SCHEDULED'] } } }],
    },
    select: { id: true },
    take: 100,
  });
  let released = 0;
  for (const p of pending) {
    const r = await releaseEscrowToSeller(p.id, 'auto_release').catch(() => null);
    if (r?.ok && !r.alreadySettled) released += 1;
  }
  return { released };
}
