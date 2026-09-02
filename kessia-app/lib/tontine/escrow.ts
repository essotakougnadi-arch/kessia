// ============================================================
// KESSIA — Compte séquestre d'une tontine (cahier des charges §6.5)
//
// Chaque tontine active possède un wallet `TONTINE_ESCROW` dédié qui
// DÉTIENT réellement les cotisations d'un cycle entre l'encaissement
// (débit du membre → crédit du séquestre) et le versement au
// bénéficiaire (débit du séquestre → crédit du membre).
//
// Invariant vérifiable à tout instant :
//   solde du séquestre == Σ(cotisations PAID) − Σ(membre.totalReceived)
//
// « argent réellement détenu » = solde du wallet séquestre, adossé au
// ledger — plus aucune cagnotte « nulle part » entre deux tours.
// ============================================================

import { Prisma } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { postDoubleEntry } from '@/lib/ledger/ledger.service';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Renvoie le wallet séquestre de la tontine, en le créant si besoin.
 * Idempotent (contrainte d'unicité sur `tontineId`). Accepte un client
 * transactionnel pour la création à l'activation.
 */
export async function getOrCreateEscrowWallet(
  tontineId: string,
  currency = 'XOF',
  db: Db = prisma
) {
  return db.wallet.upsert({
    where: { tontineId },
    create: { tontineId, kind: 'TONTINE_ESCROW', currency, balance: 0 },
    update: {},
  });
}

/** Montant qui DEVRAIT être détenu d'après la comptabilité des cotisations. */
export async function escrowExpectedHeld(tontineId: string): Promise<number> {
  const [paidAgg, members] = await Promise.all([
    prisma.tontineContribution.aggregate({
      where: { tontineId, status: 'PAID' },
      _sum: { amount: true },
    }),
    prisma.tontineMember.aggregate({
      where: { tontineId },
      _sum: { totalReceived: true },
    }),
  ]);
  const paidIn = Number(paidAgg._sum.amount ?? 0);
  const paidOut = Number(members._sum.totalReceived ?? 0);
  return Math.round((paidIn - paidOut) * 100) / 100;
}

export type EscrowReconciliation = {
  tontineId: string;
  hasEscrow: boolean;
  held: number;
  expectedHeld: number;
  /** held − expectedHeld ; 0 = comptes alignés */
  drift: number;
  balanced: boolean;
};

/**
 * Rapproche le solde réel du séquestre et le montant attendu d'après les
 * cotisations. Un `drift` non nul signale une incohérence à investiguer
 * (jamais corrigée silencieusement).
 */
export async function reconcileTontineEscrow(
  tontineId: string
): Promise<EscrowReconciliation> {
  const [escrow, expectedHeld] = await Promise.all([
    prisma.wallet.findUnique({ where: { tontineId }, select: { balance: true } }),
    escrowExpectedHeld(tontineId),
  ]);
  const held = escrow ? Number(escrow.balance) : 0;
  const drift = Math.round((held - expectedHeld) * 100) / 100;
  return {
    tontineId,
    hasEscrow: escrow !== null,
    held,
    expectedHeld,
    drift,
    balanced: Math.abs(drift) < 0.01,
  };
}

export type EscrowRefundResult = {
  refunded: number;
  totalAmount: number;
  skipped: number;
};

/**
 * Rembourse le séquestre aux cotisants au prorata de ce qu'ils ont versé
 * et pas encore reçu. Prévu pour l'annulation d'une tontine (aucun flux
 * d'annulation n'existe encore côté API — helper défensif, testé).
 * Idempotent par membre (`ESCROW-REFUND-<tontineId>-<memberId>`).
 */
export async function refundTontineEscrow(
  tontineId: string,
  reason = 'Tontine annulée'
): Promise<EscrowRefundResult> {
  const escrow = await prisma.wallet.findUnique({ where: { tontineId } });
  if (!escrow || Number(escrow.balance) <= 0) {
    return { refunded: 0, totalAmount: 0, skipped: 0 };
  }

  const tontine = await prisma.tontine.findUnique({
    where: { id: tontineId },
    select: { name: true, currency: true },
  });

  const members = await prisma.tontineMember.findMany({
    where: { tontineId },
    select: { id: true, userId: true, totalContributed: true, totalReceived: true },
  });

  let refunded = 0;
  let totalAmount = 0;
  let skipped = 0;

  for (const m of members) {
    const owed = Math.round((Number(m.totalContributed) - Number(m.totalReceived)) * 100) / 100;
    if (owed <= 0) {
      skipped += 1;
      continue;
    }
    const wallet = await prisma.wallet.findUnique({ where: { userId: m.userId } });
    if (!wallet) {
      skipped += 1;
      continue;
    }
    const res = await postDoubleEntry({
      fromWalletId: escrow.id,
      toWalletId: wallet.id,
      type: 'REFUND',
      amount: owed,
      description: `Remboursement séquestre — ${tontine?.name ?? 'tontine'}`,
      referenceId: tontineId,
      idempotencyKey: `ESCROW-REFUND-${tontineId}-${m.id}`,
      metadata: { tontineId, memberId: m.id, reason },
    });
    if (res.success) {
      await prisma.tontineMember.update({
        where: { id: m.id },
        data: { totalReceived: { increment: owed } },
      });
      refunded += 1;
      totalAmount += owed;
    } else {
      skipped += 1;
    }
  }

  return { refunded, totalAmount: Math.round(totalAmount * 100) / 100, skipped };
}
