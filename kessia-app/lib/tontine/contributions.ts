// ============================================================
// KESSIA — Règlement d'une cotisation de tontine (cahier des charges §6.5)
//
// Cœur monétaire, partagé par la route /contribute, le seed et les
// tests d'intégration : débite le membre et CRÉDITE le séquestre de la
// tontine dans une seule écriture atomique à double entrée, puis marque
// la cotisation PAID. Plus aucune cotisation « payée » sans contrepartie
// détenue.
// ============================================================

import prisma from '@/lib/db/prisma';
import { postDoubleEntry } from '@/lib/ledger/ledger.service';
import { getOrCreateEscrowWallet } from './escrow';

export type SettleContributionInput = {
  tontineId: string;
  /** id du TontineMember qui cotise */
  memberId: string;
  /** id de l'utilisateur (pour retrouver son wallet) */
  payerUserId: string;
  round: number;
  amount: number;
  tontineName: string;
  currency?: string;
  /** suffixe d'idempotence facultatif (header Idempotency-Key) */
  idempotencySuffix?: string | null;
};

export type SettleContributionResult = {
  ok: boolean;
  contributionId?: string;
  balanceAfter?: number;
  escrowBalanceAfter?: number;
  ledgerRef?: string;
  error?: string;
};

export async function settleContribution(
  input: SettleContributionInput
): Promise<SettleContributionResult> {
  const currency = input.currency ?? 'XOF';

  const payerWallet = await prisma.wallet.findUnique({
    where: { userId: input.payerUserId },
  });
  if (!payerWallet) return { ok: false, error: 'Wallet introuvable.' };
  if (payerWallet.isLocked) return { ok: false, error: 'Votre wallet est verrouillé.' };
  if (Number(payerWallet.balance) < input.amount) {
    return { ok: false, error: 'Solde insuffisant pour cotiser.' };
  }

  const escrow = await getOrCreateEscrowWallet(input.tontineId, currency);

  // Idempotence : une cotisation = (membre, tour). Un double clic ne
  // débite jamais deux fois. Le header éventuel élargit la clé.
  const baseKey = `TCONTRIB-${input.memberId}-${input.round}`;
  const idempotencyKey = input.idempotencySuffix
    ? `${baseKey}-${input.idempotencySuffix}`
    : baseKey;

  const moved = await postDoubleEntry({
    fromWalletId: payerWallet.id,
    toWalletId: escrow.id,
    type: 'TONTINE_CONTRIBUTION',
    amount: input.amount,
    description: `Cotisation Tontine « ${input.tontineName} » — Tour ${input.round}`,
    descriptionTo: `Cotisation reçue — « ${input.tontineName} » Tour ${input.round}`,
    referenceId: input.tontineId,
    idempotencyKey,
    metadata: {
      tontineId: input.tontineId,
      round: input.round,
      memberId: input.memberId,
      leg: 'contribution',
    },
  });

  if (!moved.success) {
    return { ok: false, error: moved.error ?? 'Erreur lors de la cotisation.' };
  }

  // Marquer la cotisation PAID + incrémenter le total cotisé du membre,
  // atomiquement. Réglé ré-entrant (upsert sur (membre, tour)).
  const contribution = await prisma.$transaction(async (tx) => {
    const found = await tx.tontineContribution.findFirst({
      where: { memberId: input.memberId, round: input.round },
      select: { id: true, status: true },
    });

    const alreadyPaid = found?.status === 'PAID';

    const contrib = found
      ? await tx.tontineContribution.update({
          where: { id: found.id },
          data: { status: 'PAID', paidAt: new Date(), transactionId: moved.outEntryId },
        })
      : await tx.tontineContribution.create({
          data: {
            tontineId: input.tontineId,
            memberId: input.memberId,
            round: input.round,
            amount: input.amount,
            status: 'PAID',
            dueDate: new Date(),
            paidAt: new Date(),
            transactionId: moved.outEntryId,
          },
        });

    if (!alreadyPaid) {
      await tx.tontineMember.update({
        where: { id: input.memberId },
        data: { totalContributed: { increment: input.amount } },
      });
    }

    return contrib;
  }, { timeout: 15_000, maxWait: 8_000 });

  return {
    ok: true,
    contributionId: contribution.id,
    balanceAfter: moved.fromBalanceAfter,
    escrowBalanceAfter: moved.toBalanceAfter,
    ledgerRef: moved.outEntryId,
  };
}
