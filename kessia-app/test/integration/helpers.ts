// ============================================================
// Utilitaires partagés des tests d'intégration.
// Données jetables préfixées `itest_`, nettoyage en cascade manuelle.
// ============================================================

import { randomUUID } from 'node:crypto';
import type { KycStatus } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { settleContribution } from '@/lib/tontine/contributions';

export { prisma };

export function tag(): string {
  return `itest_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

/** Numéro de téléphone jetable (préfixe +22899… hors plage de seed). */
export function throwawayPhone(): string {
  return `+22899${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
}

export type ITestUser = {
  id: string;
  phone: string;
  walletId: string;
};

export async function makeUser(opts?: {
  balance?: number;
  kycStatus?: KycStatus;
  kycLevel?: number;
  locked?: boolean;
}): Promise<ITestUser> {
  const t = tag();
  const user = await prisma.user.create({
    data: {
      phone: throwawayPhone(),
      firstName: 'IT',
      lastName: t,
      passwordHash: 'x',
      isPhoneVerified: true,
      isActive: true,
      kycStatus: opts?.kycStatus ?? 'NOT_STARTED',
      kycLevel: opts?.kycLevel ?? 0,
      wallet: {
        create: {
          balance: opts?.balance ?? 0,
          currency: 'XOF',
          isLocked: opts?.locked ?? false,
        },
      },
    },
    include: { wallet: true },
  });
  return { id: user.id, phone: user.phone, walletId: user.wallet!.id };
}

const swallow = (p: Promise<unknown>) => p.then(() => {}, () => {});

/**
 * Supprime les données jetables dans l'ordre des dépendances.
 * Tolérant : chaque étape est encapsulée (une FK résiduelle ne casse
 * pas le reste du nettoyage).
 */
export async function cleanup(input: {
  userIds?: string[];
  tontineIds?: string[];
  phones?: string[];
}): Promise<void> {
  const userIds = input.userIds ?? [];
  const tontineIds = input.tontineIds ?? [];
  const phones = input.phones ?? [];

  const walletIds: string[] = [];
  if (userIds.length) {
    const ws = await prisma.wallet.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    walletIds.push(...ws.map((w) => w.id));
  }

  for (const tontineId of tontineIds) {
    // Compte séquestre (§6.5) : purge le ledger puis le wallet avant la
    // tontine (FK Restrict depuis LedgerEntry, Cascade Wallet→Tontine).
    const escrow = await prisma.wallet
      .findUnique({ where: { tontineId }, select: { id: true } })
      .catch(() => null);
    if (escrow) {
      await swallow(prisma.ledgerEntry.deleteMany({ where: { walletId: escrow.id } }));
      await swallow(prisma.wallet.delete({ where: { id: escrow.id } }));
    }
    await swallow(prisma.tontineContribution.deleteMany({ where: { tontineId } }));
    await swallow(prisma.tontineSchedule.deleteMany({ where: { tontineId } }));
    await swallow(prisma.tontineEvent.deleteMany({ where: { tontineId } }));
    await swallow(prisma.tontineMember.deleteMany({ where: { tontineId } }));
    await swallow(prisma.tontine.delete({ where: { id: tontineId } }));
  }

  if (walletIds.length) {
    await swallow(prisma.ledgerEntry.deleteMany({ where: { walletId: { in: walletIds } } }));
  }
  if (phones.length) {
    await swallow(prisma.otpCode.deleteMany({ where: { phone: { in: phones } } }));
  }
  if (userIds.length) {
    await swallow(prisma.otpCode.deleteMany({ where: { userId: { in: userIds } } }));
    await swallow(prisma.notificationDelivery.deleteMany({ where: { userId: { in: userIds } } }));
    await swallow(prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } }));
    await swallow(prisma.paymentTransaction.deleteMany({ where: { userId: { in: userIds } } }));
    await swallow(prisma.wallet.deleteMany({ where: { userId: { in: userIds } } }));
    await swallow(prisma.user.deleteMany({ where: { id: { in: userIds } } }));
  }
}

/** Laisse les tâches « fire-and-forget » (notify / audit) se poser. */
export function settle(ms = 250): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Règle toutes les cotisations non payées d'un tour EN PASSANT PAR LE
 * SÉQUESTRE (comme la route /contribute) : débit du membre → crédit du
 * compte séquestre de la tontine. Les payeurs doivent avoir un solde
 * suffisant (`makeUser({ balance })`).
 */
export async function contributeRound(tontineId: string, round: number): Promise<void> {
  const tontine = await prisma.tontine.findUniqueOrThrow({
    where: { id: tontineId },
    select: { name: true, amount: true, currency: true },
  });
  const contribs = await prisma.tontineContribution.findMany({
    where: { tontineId, round, status: { not: 'PAID' } },
    select: { memberId: true, member: { select: { userId: true } } },
  });
  for (const c of contribs) {
    const res = await settleContribution({
      tontineId,
      memberId: c.memberId,
      payerUserId: c.member.userId,
      round,
      amount: Number(tontine.amount),
      tontineName: tontine.name,
      currency: tontine.currency,
    });
    if (!res.ok) throw new Error(`contributeRound(${round}): ${res.error}`);
  }
}

/** Solde courant d'un compte séquestre de tontine. */
export async function escrowBalance(tontineId: string): Promise<number> {
  const w = await prisma.wallet.findUnique({ where: { tontineId }, select: { balance: true } });
  return w ? Number(w.balance) : 0;
}
