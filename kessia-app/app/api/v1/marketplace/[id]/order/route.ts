// ============================================================
// KESSIA — POST /api/v1/marketplace/[id]/order
//  mode WALLET  : débit acheteur → crédit vendeur (ledger atomique)
//  mode TONTINE : crée une tontine Achat individuelle (SOLO)
//                 pré-remplie avec le prix de l'article comme cible
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
import { generateInviteCode } from '@/lib/utils/crypto';
import { recordTontineEvent } from '@/lib/tontine/events';
import { recordAudit } from '@/lib/audit/audit.service';
import { notify } from '@/lib/notifications/notify';

export const dynamic = 'force-dynamic';

const BUYABILITY_MSG: Record<string, string> = {
  IS_SELLER: 'Vous ne pouvez pas acheter votre propre article.',
  NOT_ACTIVE: 'Cet article n\'est plus disponible.',
  OUT_OF_STOCK: 'Cet article est épuisé.',
  TONTINE_NOT_ALLOWED: 'Cet article n\'est pas payable par tontine.',
  INSUFFICIENT_BALANCE: 'Solde insuffisant. Rechargez votre wallet.',
};

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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
      const idem = `MKT_ORDER_${item.id}_${context.userId}_${Date.now()}`;
      const led = await postDoubleEntry({
        fromWalletId: buyerWallet.id,
        toWalletId: item.seller.wallet.id,
        type: 'SALE_PAYMENT',
        amount: price,
        description: `Achat marketplace — ${item.title}`,
        descriptionTo: `Vente marketplace — ${item.title}`,
        referenceId: item.id,
        idempotencyKey: idem,
        metadata: { itemId: item.id, kind: 'marketplace' },
      });
      if (!led.success) return badRequest(led.error ?? 'Le paiement a échoué.');

      const order = await prisma.$transaction(async (tx) => {
        await tx.marketplaceItem.update({
          where: { id: item.id },
          data: {
            stock: { decrement: 1 },
            ...(item.stock - 1 <= 0 ? { status: 'SOLD_OUT' } : {}),
          },
        });
        return tx.marketplaceOrder.create({
          data: {
            itemId: item.id, buyerId: context.userId, mode: 'WALLET',
            amount: price, currency: item.currency, status: 'PAID', ledgerRef: idem,
          },
        });
      });

      void notify({
        userId: item.sellerId,
        category: 'PAYMENT',
        priority: 'HIGH',
        title: 'Article vendu 🎉',
        body: `Votre article « ${item.title} » a été acheté (${price.toLocaleString('fr-FR')} ${item.currency}).`,
        actionUrl: '/marketplace/mine',
      });
      void recordAudit({
        userId: context.userId, action: 'marketplace.order.wallet', entity: 'MarketplaceOrder', entityId: order.id, request,
      });

      return created({ orderId: order.id, mode: 'WALLET', status: 'PAID' }, 'Achat réglé depuis votre wallet.');
    }

    // ─────────────────────────── TONTINE ──────────────────────────
    const installments = body.installments;
    const perPayment = installmentAmount(price, installments);

    let inviteCode = generateInviteCode();
    for (let i = 0; i < 5; i++) {
      if (!(await prisma.tontine.findUnique({ where: { inviteCode }, select: { id: true } }))) break;
      inviteCode = generateInviteCode();
    }

    const { tontine, order } = await prisma.$transaction(async (tx) => {
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
      const o = await tx.marketplaceOrder.create({
        data: {
          itemId: item.id, buyerId: context.userId, mode: 'TONTINE',
          amount: price, currency: item.currency, status: 'TONTINE_STARTED', tontineId: t.id,
        },
      });
      return { tontine: t, order: o };
    });

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
