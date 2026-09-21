// ============================================================
// KESSIA — POST /api/v1/marketplace/[id]/order
//  mode WALLET  : débit acheteur → crédit vendeur (ledger atomique)
//  mode TONTINE : crée une tontine Achat individuelle (SOLO)
//                 pré-remplie avec le prix de l'article comme cible
//
// Idempotence (P0.4, cahier §16) :
//   - En-tête `Idempotency-Key` (même convention que wallet/transfer et
//     tontine/[id]/contribute, ADR 0007 §3) → clé stable stockée sur
//     `MarketplaceOrder.idempotencyKey` (@unique). Un rejeu avec la même
//     clé renvoie la commande existante sans retraiter paiement ni stock.
//   - Stock verrouillé (`SELECT ... FOR UPDATE`) et revérifié À L'INTÉRIEUR
//     de la transaction qui le décrémente — deux acheteurs concurrents du
//     dernier exemplaire ne peuvent plus tous les deux réussir.
//   - Si le paiement a réussi mais que la réservation de stock échoue
//     ensuite (perdu la course à un acheteur concurrent), l'acheteur est
//     remboursé immédiatement (reversal symétrique via `postDoubleEntry`,
//     même mécanisme que le reversal de `wallet/transfer`).
//
// Plafonds KYC (P0.5, §30) : un achat mode WALLET est désormais soumis à
// `checkOutboundLimit`, comme `wallet/transfer` et `payments` — un compte
// non vérifié ne peut plus dépenser sans plafond via la marketplace.
// ============================================================

import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withAuth } from '@/lib/auth/middleware';
import { orderSchema } from '@/lib/validations/marketplace';
import { describeBuyability, installmentAmount } from '@/lib/marketplace/marketplace';
import { ok, created, notFound, conflict, badRequest, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { postDoubleEntry } from '@/lib/ledger/ledger.service';
import { getMarketplaceEscrowWallet } from '@/lib/marketplace/escrow';
import { generateInviteCode } from '@/lib/utils/crypto';
import { recordTontineEvent } from '@/lib/tontine/events';
import { recordAudit } from '@/lib/audit/audit.service';
import { notify } from '@/lib/notifications/notify';
import { checkOutboundLimit } from '@/lib/kyc/limits';
import { Prisma, type MarketplaceOrder } from '@prisma/client';

export const dynamic = 'force-dynamic';

const BUYABILITY_MSG: Record<string, string> = {
  IS_SELLER: 'Vous ne pouvez pas acheter votre propre article.',
  NOT_ACTIVE: 'Cet article n\'est plus disponible.',
  OUT_OF_STOCK: 'Cet article est épuisé.',
  TONTINE_NOT_ALLOWED: 'Cet article n\'est pas payable par tontine.',
  INSUFFICIENT_BALANCE: 'Solde insuffisant. Rechargez votre wallet.',
};

/** Réponse pour une commande déjà existante (rejeu détecté par idempotencyKey). */
async function respondExisting(order: MarketplaceOrder) {
  if (order.mode === 'TONTINE' && order.tontineId) {
    const t = await prisma.tontine.findUnique({
      where: { id: order.tontineId },
      select: { amount: true, totalRounds: true },
    });
    return ok(
      {
        orderId: order.id, mode: 'TONTINE', status: order.status, tontineId: order.tontineId,
        perPayment: t ? Number(t.amount) : undefined, installments: t?.totalRounds, duplicate: true,
      },
      'Commande déjà enregistrée (requête déjà traitée).'
    );
  }
  return ok(
    { orderId: order.id, mode: 'WALLET', status: order.status, settlement: order.settlement, duplicate: true },
    'Commande déjà enregistrée (requête déjà traitée).'
  );
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'marketplace.order', {
      limit: 15, windowMs: 60 * 60_000, by: context.userId,
    });
    if (limited) return limited;

    const parsed = orderSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const body = parsed.data;

    // Idempotence de bout en bout : un rejeu avec la même clé (même
    // client, même tentative) renvoie la commande déjà créée.
    const idemHeader = request.headers.get('idempotency-key')?.trim().slice(0, 100) || null;
    if (idemHeader) {
      const existing = await prisma.marketplaceOrder.findUnique({ where: { idempotencyKey: idemHeader } });
      if (existing) return respondExisting(existing);
    }

    const item = await prisma.marketplaceItem.findUnique({
      where: { id: params.id },
      include: { seller: { select: { id: true, firstName: true, wallet: { select: { id: true } } } } },
    });
    if (!item || item.status === 'ARCHIVED') return notFound('Article introuvable.');

    const price = Number(item.price);
    const buyerWallet = await prisma.wallet.findUnique({
      where: { userId: context.userId },
      select: { id: true, balance: true, currency: true },
    });

    const buyability = describeBuyability({
      status: item.status,
      stock: item.stock,
      isSeller: item.sellerId === context.userId,
      mode: body.mode,
      payableByTontine: item.payableByTontine,
      buyerBalance: buyerWallet ? Number(buyerWallet.balance) : 0,
      price,
    });
    if (!buyability.ok) {
      const msg = BUYABILITY_MSG[buyability.code] ?? 'Commande impossible.';
      return buyability.code === 'INSUFFICIENT_BALANCE' ? badRequest(msg) : conflict(msg);
    }

    // ─────────────────────────── WALLET ───────────────────────────
    if (body.mode === 'WALLET') {
      if (!buyerWallet || !item.seller.wallet) {
        return badRequest('Wallet manquant pour finaliser le paiement.');
      }

      // Plafonds KYC (§30, P0.5) — appliqués côté serveur, même contrôle
      // que wallet/transfer et payments. Un achat marketplace est un
      // débit sortant comme un autre ; il ne doit pas contourner le
      // palier de l'acheteur.
      const limit = await checkOutboundLimit(context.userId, price);
      if (!limit.allowed) return badRequest(limit.reason ?? 'Plafond de transaction atteint.');

      const onDelivery = item.settlement === 'ON_DELIVERY';
      // Clé stable si le client fournit Idempotency-Key ; à défaut, repli
      // non rejouable (même limite acceptée par wallet/transfer sans
      // l'en-tête — le client KESSIA l'envoie toujours, voir hooks/useMarketplace.ts).
      const idem = idemHeader
        ? `MKT_ORDER_${idemHeader}`
        : `MKT_ORDER_${item.id}_${context.userId}_${Date.now()}`;

      // ON_DELIVERY → fonds vers le séquestre plateforme, versés au
      // vendeur à la confirmation de réception (ADR 0045).
      const destWalletId = onDelivery
        ? (await getMarketplaceEscrowWallet()).id
        : item.seller.wallet.id;

      const led = await postDoubleEntry({
        fromWalletId: buyerWallet.id,
        toWalletId: destWalletId,
        type: 'SALE_PAYMENT',
        amount: price,
        description: `Achat marketplace — ${item.title}`,
        descriptionTo: onDelivery
          ? `Séquestre marketplace — ${item.title}`
          : `Vente marketplace — ${item.title}`,
        referenceId: item.id,
        idempotencyKey: idem,
        metadata: { itemId: item.id, kind: 'marketplace', settlement: item.settlement },
      });
      if (!led.success) return badRequest(led.error ?? 'Le paiement a échoué.');

      let order: MarketplaceOrder;
      try {
        order = await prisma.$transaction(async (tx) => {
          // Verrou + relecture fraîche du stock : deux acheteurs concurrents
          // du dernier exemplaire ne peuvent plus tous les deux réussir.
          const [locked] = await tx.$queryRaw<{ stock: number; status: string }[]>`
            SELECT stock, status FROM marketplace_items WHERE id = ${item.id} FOR UPDATE
          `;
          if (!locked || locked.stock <= 0 || locked.status !== 'ACTIVE') {
            throw new Error('SOLD_OUT_UNDER_LOCK');
          }
          await tx.marketplaceItem.update({
            where: { id: item.id },
            data: {
              stock: { decrement: 1 },
              ...(locked.stock - 1 <= 0 ? { status: 'SOLD_OUT' } : {}),
            },
          });
          return tx.marketplaceOrder.create({
            data: {
              itemId: item.id, buyerId: context.userId, mode: 'WALLET',
              amount: price, currency: item.currency,
              status: onDelivery ? 'PENDING_SETTLEMENT' : 'PAID',
              settlement: item.settlement,
              ledgerRef: idem,
              ...(idemHeader ? { idempotencyKey: idemHeader } : {}),
            },
          });
        });
      } catch (txError) {
        // Stock épuisé sous verrou (perdu la course à un acheteur
        // concurrent) APRÈS que le paiement a réussi : rembourser
        // immédiatement plutôt que de laisser l'acheteur débité sans
        // commande — mirroir du reversal de wallet/transfer.
        if (txError instanceof Error && txError.message === 'SOLD_OUT_UNDER_LOCK') {
          const reversal = await postDoubleEntry({
            fromWalletId: destWalletId,
            toWalletId: buyerWallet.id,
            type: 'REVERSAL',
            amount: price,
            description: `Remboursement — article épuisé entre-temps (${item.title})`,
            referenceId: item.id,
            idempotencyKey: `${idem}:REVERSAL`,
            metadata: { itemId: item.id, kind: 'marketplace_oversell_reversal' },
          });
          logApiError(
            '/v1/marketplace/[id]/order',
            new Error(`Stock épuisé sous verrou pour ${item.id} après paiement ${idem} ; reversal ${reversal.success ? 'OK' : 'ÉCHOUÉ: ' + reversal.error}`)
          );
          return conflict(
            reversal.success
              ? 'Cet article vient d\'être vendu à quelqu\'un d\'autre. Vous avez été remboursé.'
              : 'Cet article vient d\'être vendu à quelqu\'un d\'autre. Le remboursement a échoué — contactez le support.'
          );
        }
        // Deux requêtes strictement concurrentes avec la même
        // Idempotency-Key (double-clic échappant à la garde d'interface,
        // ou rejeu réseau exact) : le paiement a déjà été dédupliqué par
        // postDoubleEntry ci-dessus ; ici c'est la création de la commande
        // elle-même qui bute sur la contrainte d'unicité — la requête
        // gagnante a déjà tout créé, on renvoie sa commande au lieu d'un 500.
        if (idemHeader && txError instanceof Prisma.PrismaClientKnownRequestError && txError.code === 'P2002') {
          const existing = await prisma.marketplaceOrder.findUnique({ where: { idempotencyKey: idemHeader } });
          if (existing) return respondExisting(existing);
        }
        throw txError;
      }

      void notify({
        userId: item.sellerId,
        category: 'PAYMENT',
        priority: 'HIGH',
        title: onDelivery ? 'Article réservé (séquestre)' : 'Article vendu 🎉',
        body: onDelivery
          ? `« ${item.title} » a un acheteur (${price.toLocaleString('fr-FR')} ${item.currency}). Les fonds sont en séquestre : vous serez réglé à la confirmation de réception.`
          : `Votre article « ${item.title} » a été acheté (${price.toLocaleString('fr-FR')} ${item.currency}).`,
        actionUrl: '/marketplace/mine',
      });
      void recordAudit({
        userId: context.userId, action: 'marketplace.order.wallet', entity: 'MarketplaceOrder', entityId: order.id,
        metadata: { settlement: item.settlement }, request,
      });

      return created(
        { orderId: order.id, mode: 'WALLET', status: order.status, settlement: item.settlement },
        onDelivery
          ? 'Achat réglé — fonds en séquestre jusqu\'à la réception. Organisez la livraison.'
          : 'Achat réglé depuis votre wallet.',
      );
    }

    // ─────────────────────────── TONTINE ──────────────────────────
    const installments = body.installments;
    const perPayment = installmentAmount(price, installments);

    let inviteCode = generateInviteCode();
    for (let i = 0; i < 5; i++) {
      if (!(await prisma.tontine.findUnique({ where: { inviteCode }, select: { id: true } }))) break;
      inviteCode = generateInviteCode();
    }

    let tontine: Awaited<ReturnType<typeof prisma.tontine.create>>;
    let order: MarketplaceOrder;
    try {
      ({ tontine, order } = await prisma.$transaction(async (tx) => {
        const t = await tx.tontine.create({
          data: {
            name: `Achat — ${item.title}`,
            description: `Plan d'épargne pour l'achat de « ${item.title} » sur la marketplace KESSIA.`,
            type: 'PURCHASE',
            purchaseMode: 'SOLO',
            purchaseItem: item.title,
            targetAmount: price,
            amount: perPayment,
            currency: item.currency,
            frequency: 'MONTHLY',
            startDate: new Date(),
            maxMembers: 1,
            isPublic: false,
            inviteCode,
            totalRounds: installments,
            createdById: context.userId,
            members: {
              create: { userId: context.userId, orderPosition: 1, agreementAcceptedAt: new Date() },
            },
          },
        });
        // Idempotence : si `idempotencyKey` entre en conflit (rejeu
        // concurrent exact), toute la transaction — y compris la tontine
        // ci-dessus — est annulée, aucune tontine orpheline ne subsiste.
        const o = await tx.marketplaceOrder.create({
          data: {
            itemId: item.id, buyerId: context.userId, mode: 'TONTINE',
            amount: price, currency: item.currency, status: 'TONTINE_STARTED', tontineId: t.id,
            ...(idemHeader ? { idempotencyKey: idemHeader } : {}),
          },
        });
        return { tontine: t, order: o };
      }));
    } catch (txError) {
      if (idemHeader && txError instanceof Prisma.PrismaClientKnownRequestError && txError.code === 'P2002') {
        const existing = await prisma.marketplaceOrder.findUnique({ where: { idempotencyKey: idemHeader } });
        if (existing) return respondExisting(existing);
      }
      throw txError;
    }

    void recordTontineEvent({
      tontineId: tontine.id, type: 'CREATED', actorId: context.userId,
      metadata: { via: 'marketplace', itemId: item.id },
    });
    void notify({
      userId: item.sellerId,
      category: 'BUSINESS',
      title: 'Achat par tontine lancé',
      body: `Un acheteur a démarré un plan d'épargne pour « ${item.title} ».`,
      actionUrl: '/marketplace/mine',
    });
    void recordAudit({
      userId: context.userId, action: 'marketplace.order.tontine', entity: 'MarketplaceOrder', entityId: order.id, request,
    });

    return created(
      { orderId: order.id, mode: 'TONTINE', status: 'TONTINE_STARTED', tontineId: tontine.id, perPayment, installments },
      `Plan d'épargne créé : ${installments} versements de ${perPayment.toLocaleString('fr-FR')} ${item.currency}. Démarrez-le quand vous voulez.`
    );
  } catch (error) {
    logApiError('/v1/marketplace/[id]/order', error);
    return serverError();
  }
}
