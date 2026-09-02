// ============================================================
// KESSIA — Service Ledger
// Toutes les opérations financières passent par ici
// ============================================================

import { Decimal } from '@prisma/client/runtime/library';
import { Prisma, TransactionType, Direction, TransactionStatus } from '@prisma/client';
import prisma from '../db/prisma';
import { generateIdempotencyKey } from '../utils/crypto';

/**
 * Verrouille une ou plusieurs lignes `wallets` pour la durée de la
 * transaction (`SELECT … FOR UPDATE`). Les identifiants sont verrouillés
 * dans l'ordre lexicographique — deux transactions concurrentes qui
 * touchent les mêmes wallets prennent les verrous dans le même ordre,
 * ce qui exclut l'inter-blocage. Sans ce verrou, deux débits simultanés
 * pourraient lire le même solde et le franchir (TOCTOU).
 */
async function lockWallets(
  tx: Prisma.TransactionClient,
  walletIds: string[]
): Promise<void> {
  const ordered = [...new Set(walletIds)].sort();
  for (const id of ordered) {
    await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${id} FOR UPDATE`;
  }
}

export type LedgerEntryInput = {
  walletId: string;
  type: TransactionType;
  direction: Direction;
  amount: number;
  description?: string;
  referenceId?: string;
  externalReference?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type LedgerResult = {
  success: boolean;
  entryId?: string;
  balanceAfter?: number;
  error?: string;
};

/**
 * Crée une entrée ledger et met à jour le solde du wallet.
 * Utilise une transaction Prisma pour garantir l'atomicité.
 */
export async function createLedgerEntry(input: LedgerEntryInput): Promise<LedgerResult> {
  const idempotencyKey =
    input.idempotencyKey ?? generateIdempotencyKey(input.type);

  // Vérification d'idempotence
  const existing = await prisma.ledgerEntry.findFirst({
    where: { idempotencyKey },
  });

  if (existing) {
    return {
      success: true,
      entryId: existing.id,
      balanceAfter: Number(existing.balanceAfter),
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verrouiller la ligne wallet puis relire le solde à jour
      await lockWallets(tx, [input.walletId]);
      const wallet = await tx.wallet.findUnique({
        where: { id: input.walletId },
      });

      if (!wallet) throw new Error('Wallet introuvable');
      if (wallet.isLocked) throw new Error('Wallet verrouillé');

      const balanceBefore = new Decimal(wallet.balance);
      const amount = new Decimal(input.amount);

      // 2. Calculer le nouveau solde
      let balanceAfter: Decimal;
      if (input.direction === Direction.CREDIT) {
        balanceAfter = balanceBefore.add(amount);
      } else {
        balanceAfter = balanceBefore.sub(amount);
        if (balanceAfter.isNegative()) {
          throw new Error('Solde insuffisant');
        }
      }

      // 3. Créer l'entrée ledger
      const entry = await tx.ledgerEntry.create({
        data: {
          walletId: input.walletId,
          type: input.type,
          direction: input.direction,
          amount: amount,
          balanceBefore: balanceBefore,
          balanceAfter: balanceAfter,
          status: TransactionStatus.COMPLETED,
          description: input.description,
          referenceId: input.referenceId,
          externalReference: input.externalReference,
          idempotencyKey,
          metadata: input.metadata as Parameters<typeof tx.ledgerEntry.create>[0]['data']['metadata'],
          processedAt: new Date(),
        },
      });

      // 4. Mettre à jour le solde du wallet
      await tx.wallet.update({
        where: { id: input.walletId },
        data: { balance: balanceAfter },
      });

      return { entry, balanceAfter };
    }, { timeout: 15_000, maxWait: 8_000 });

    return {
      success: true,
      entryId: result.entry.id,
      balanceAfter: Number(result.balanceAfter),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur ledger inconnue',
    };
  }
}

export type DoubleEntryInput = {
  /** wallet débité */
  fromWalletId: string;
  /** wallet crédité */
  toWalletId: string;
  /** nature économique de l'opération (identique sur les deux jambes) */
  type: TransactionType;
  amount: number;
  description: string;
  /** libellé distinct pour la jambe crédit (défaut : `description`) */
  descriptionTo?: string;
  referenceId?: string;
  /** clé de base — les jambes utilisent `${key}:out` et `${key}:in` */
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export type DoubleEntryResult = {
  success: boolean;
  outEntryId?: string;
  inEntryId?: string;
  fromBalanceAfter?: number;
  toBalanceAfter?: number;
  error?: string;
};

/**
 * Écriture à double entrée entièrement atomique entre deux wallets
 * KESSIA. Contrairement à `createLedgerEntry` × 2 + compensation (utilisé
 * par le transfert P2P pour raisons historiques), les deux jambes vivent
 * dans la même transaction : soit les deux réussissent, soit aucune.
 *
 * - verrouillage des deux lignes wallet dans l'ordre lexicographique ;
 * - garde de solde sur la jambe débit (jamais de découvert) ;
 * - idempotent : rejouer avec la même `idempotencyKey` ne rejoue rien.
 *
 * Employé pour tout mouvement tontine ↔ séquestre (§6.5).
 */
export async function postDoubleEntry(
  input: DoubleEntryInput
): Promise<DoubleEntryResult> {
  const outKey = `${input.idempotencyKey}:out`;
  const inKey = `${input.idempotencyKey}:in`;

  if (!(input.amount > 0)) {
    return { success: false, error: 'Montant invalide' };
  }
  if (input.fromWalletId === input.toWalletId) {
    return { success: false, error: 'Les deux wallets sont identiques' };
  }

  // Idempotence : la jambe débit est créée en même temps que la jambe
  // crédit, donc sa présence suffit à conclure que l'opération a eu lieu.
  const existing = await prisma.ledgerEntry.findFirst({ where: { idempotencyKey: outKey } });
  if (existing) {
    const twin = await prisma.ledgerEntry.findFirst({ where: { idempotencyKey: inKey } });
    return {
      success: true,
      outEntryId: existing.id,
      inEntryId: twin?.id,
      fromBalanceAfter: Number(existing.balanceAfter),
      toBalanceAfter: twin ? Number(twin.balanceAfter) : undefined,
    };
  }

  try {
    const res = await prisma.$transaction(async (tx) => {
      await lockWallets(tx, [input.fromWalletId, input.toWalletId]);
      const wallets = await tx.wallet.findMany({
        where: { id: { in: [input.fromWalletId, input.toWalletId] } },
      });
      const from = wallets.find((w) => w.id === input.fromWalletId);
      const to = wallets.find((w) => w.id === input.toWalletId);
      if (!from) throw new Error('Wallet source introuvable');
      if (!to) throw new Error('Wallet destination introuvable');
      if (from.isLocked) throw new Error('Wallet source verrouillé');
      if (to.isLocked) throw new Error('Wallet destination verrouillé');
      if (from.currency !== to.currency) throw new Error('Devises incompatibles');

      const amount = new Decimal(input.amount);
      const fromBefore = new Decimal(from.balance);
      const toBefore = new Decimal(to.balance);
      const fromAfter = fromBefore.sub(amount);
      if (fromAfter.isNegative()) throw new Error('Solde insuffisant');
      const toAfter = toBefore.add(amount);

      const meta = input.metadata as Parameters<typeof tx.ledgerEntry.create>[0]['data']['metadata'];
      const outEntry = await tx.ledgerEntry.create({
        data: {
          walletId: from.id,
          type: input.type,
          direction: Direction.DEBIT,
          amount,
          currency: from.currency,
          balanceBefore: fromBefore,
          balanceAfter: fromAfter,
          status: TransactionStatus.COMPLETED,
          description: input.description,
          referenceId: input.referenceId,
          idempotencyKey: outKey,
          metadata: meta,
          processedAt: new Date(),
        },
      });
      const inEntry = await tx.ledgerEntry.create({
        data: {
          walletId: to.id,
          type: input.type,
          direction: Direction.CREDIT,
          amount,
          currency: to.currency,
          balanceBefore: toBefore,
          balanceAfter: toAfter,
          status: TransactionStatus.COMPLETED,
          description: input.descriptionTo ?? input.description,
          referenceId: input.referenceId,
          idempotencyKey: inKey,
          metadata: meta,
          processedAt: new Date(),
        },
      });

      await tx.wallet.update({ where: { id: from.id }, data: { balance: fromAfter } });
      await tx.wallet.update({ where: { id: to.id }, data: { balance: toAfter } });

      return { outEntry, inEntry, fromAfter, toAfter };
    }, { timeout: 15_000, maxWait: 8_000 });

    return {
      success: true,
      outEntryId: res.outEntry.id,
      inEntryId: res.inEntry.id,
      fromBalanceAfter: Number(res.fromAfter),
      toBalanceAfter: Number(res.toAfter),
    };
  } catch (error) {
    // Course entre deux appels identiques concurrents : le second bute sur
    // la contrainte d'unicité de `outKey`. C'est un succès idempotent —
    // l'écriture a bien eu lieu (par l'autre appel).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const twinOut = await prisma.ledgerEntry.findFirst({ where: { idempotencyKey: outKey } });
      const twinIn = await prisma.ledgerEntry.findFirst({ where: { idempotencyKey: inKey } });
      if (twinOut && twinIn) {
        return {
          success: true,
          outEntryId: twinOut.id,
          inEntryId: twinIn.id,
          fromBalanceAfter: Number(twinOut.balanceAfter),
          toBalanceAfter: Number(twinIn.balanceAfter),
        };
      }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur ledger inconnue',
    };
  }
}

/**
 * Récupère le solde actuel d'un wallet
 */
export async function getWalletBalance(walletId: string): Promise<number | null> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: { balance: true },
  });
  return wallet ? Number(wallet.balance) : null;
}

/**
 * Récupère l'historique paginé des transactions d'un wallet
 */
export async function getWalletHistory(
  walletId: string,
  page = 1,
  limit = 20
) {
  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.ledgerEntry.count({ where: { walletId } }),
  ]);

  return {
    entries: entries.map((e) => ({
      ...e,
      amount: Number(e.amount),
      balanceBefore: Number(e.balanceBefore),
      balanceAfter: Number(e.balanceAfter),
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasMore: skip + entries.length < total,
  };
}
