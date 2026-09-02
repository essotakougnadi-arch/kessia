// ============================================================
// KESSIA — POST /api/v1/wallet/transfer
// Transfert d'argent entre wallets KESSIA
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { createLedgerEntry } from '@/lib/ledger/ledger.service';
import { normalizePhone } from '@/lib/utils/crypto';
import { ok, badRequest, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';
import { notify } from '@/lib/notifications/notify';
import { assessEvent } from '@/lib/fraud/engine';
import { checkOutboundLimit } from '@/lib/kyc/limits';

const transferSchema = z.object({
  recipientPhone: z.string().min(8, 'Numéro de téléphone invalide'),
  amount: z.number().positive().max(2_000_000, 'Montant maximum 2 000 000 XOF'),
  description: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'wallet.transfer', {
      limit: 10, windowMs: 60_000, by: context.userId,
    });
    if (limited) return limited;

    const body = await request.json();
    const parsed = transferSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { recipientPhone, amount, description } = parsed.data;
    const normalizedRecipientPhone = normalizePhone(recipientPhone);

    // Vérifier que ce n'est pas un auto-transfert
    if (normalizedRecipientPhone === context.phone) {
      return badRequest('Vous ne pouvez pas vous transférer de l\'argent à vous-même.');
    }

    // Trouver le destinataire
    const recipient = await prisma.user.findUnique({
      where: { phone: normalizedRecipientPhone },
      include: { wallet: true },
    });

    if (!recipient || !recipient.wallet) {
      return notFound('Aucun compte KESSIA associé à ce numéro de téléphone.');
    }

    // Trouver le wallet de l'expéditeur
    const senderWallet = await prisma.wallet.findUnique({
      where: { userId: context.userId },
    });

    if (!senderWallet) return notFound('Votre wallet est introuvable.');
    if (senderWallet.isLocked) return badRequest('Votre wallet est temporairement verrouillé.');
    if (Number(senderWallet.balance) < amount) {
      return badRequest('Solde insuffisant pour effectuer ce transfert.');
    }

    // Plafonds KYC (§30) — appliqués côté serveur
    const limit = await checkOutboundLimit(context.userId, amount);
    if (!limit.allowed) return badRequest(limit.reason ?? 'Plafond de transaction atteint.');

    // Idempotence de bout en bout : si le client fournit `Idempotency-Key`,
    // les deux écritures en sont dérivées → un rejeu ne double ni le débit ni le crédit.
    const idemKey = request.headers.get('idempotency-key')?.trim().slice(0, 100) || null;

    // Générer un referenceId commun aux deux entrées (stable si idemKey fourni)
    const referenceId = idemKey
      ? `TRF-${idemKey}`
      : `TRF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const desc = description ?? `Transfert vers ${recipient.firstName} ${recipient.lastName}`;

    // Exécuter les deux entrées ledger en séquence (débit expéditeur, crédit destinataire)
    const debitResult = await createLedgerEntry({
      walletId: senderWallet.id,
      type: 'TRANSFER_OUT',
      direction: 'DEBIT',
      amount,
      description: desc,
      referenceId,
      ...(idemKey ? { idempotencyKey: `${idemKey}:out` } : {}),
      metadata: {
        recipientUserId: recipient.id,
        recipientPhone: normalizedRecipientPhone,
      },
    });

    if (!debitResult.success) {
      return badRequest(debitResult.error ?? 'Erreur lors du débit.');
    }

    const creditResult = await createLedgerEntry({
      walletId: recipient.wallet.id,
      type: 'TRANSFER_IN',
      direction: 'CREDIT',
      amount,
      description: `Transfert reçu de ${context.phone}`,
      referenceId,
      ...(idemKey ? { idempotencyKey: `${idemKey}:in` } : {}),
      metadata: {
        senderUserId: context.userId,
        senderPhone: context.phone,
      },
    });

    if (!creditResult.success) {
      // Le crédit du destinataire a échoué → on annule le débit de l'expéditeur
      // (reversal) pour ne jamais laisser d'argent « disparu ».
      const reversal = await createLedgerEntry({
        walletId: senderWallet.id,
        type: 'REVERSAL',
        direction: 'CREDIT',
        amount,
        description: `Annulation du transfert ${referenceId} (crédit destinataire impossible)`,
        referenceId,
        idempotencyKey: `REV-${referenceId}`,
        metadata: { reversalOf: referenceId, reason: 'credit_failed' },
      });

      logApiError('/v1/wallet/transfer', new Error(
        `Credit failed for ${referenceId}; reversal ${reversal.success ? 'OK' : 'FAILED: ' + reversal.error}`
      ));
      void recordAudit({
        userId: context.userId,
        action: 'wallet.transfer_failed',
        entity: 'LedgerEntry',
        entityId: referenceId,
        metadata: {
          amount,
          recipientUserId: recipient.id,
          reason: 'credit_failed',
          reversed: reversal.success,
        },
        request,
      });

      return serverError(
        reversal.success
          ? 'Le transfert a échoué et votre solde a été rétabli. Réessayez plus tard.'
          : 'Erreur lors du transfert. Contactez le support (référence ' + referenceId + ').'
      );
    }

    void recordAudit({
      userId: context.userId,
      action: 'wallet.transfer',
      entity: 'LedgerEntry',
      entityId: referenceId,
      metadata: {
        amount,
        recipientUserId: recipient.id,
        senderBalanceAfter: debitResult.balanceAfter,
      },
      request,
    });

    void notify({
      userId: recipient.id,
      category: 'PAYMENT',
      priority: 'NORMAL',
      title: 'Transfert reçu',
      body: `Vous avez reçu ${amount.toLocaleString('fr-FR')} XOF de ${context.phone}.`,
      actionUrl: '/wallet',
    });

    // Évaluation anti-fraude (§32) — non bloquante, revue humaine
    void assessEvent({
      userId: context.userId,
      context: 'transfer',
      amount,
      balanceBefore: Number(senderWallet.balance),
      entityId: referenceId,
      recipientUserId: recipient.id,
      request,
    });

    return ok(
      {
        referenceId,
        amount,
        recipient: {
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          phone: normalizedRecipientPhone,
        },
        senderBalanceAfter: debitResult.balanceAfter,
      },
      `Transfert de ${amount.toLocaleString('fr-FR')} XOF vers ${recipient.firstName} ${recipient.lastName} réussi.`
    );
  } catch (error) {
    logApiError('/v1/wallet/transfer', error);
    return serverError();
  }
}
