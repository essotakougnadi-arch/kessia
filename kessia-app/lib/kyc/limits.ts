// ============================================================
// KESSIA — Plafonds de transaction par niveau KYC (cahier des charges §30)
//
// « Ne jamais contourner KYC, AML, permissions » (MASTER #14). Les
// plafonds sont appliqués CÔTÉ SERVEUR (ledger), pas seulement dans
// l'UI. Ils restent volontairement conservateurs tant que le KYC
// n'est pas renforcé par un prestataire IDV (liveness) + screening.
// ============================================================

import prisma from '@/lib/db/prisma';
import type { KycStatus, TransactionType } from '@prisma/client';

export type KycTier = 0 | 1 | 2;

export type TierLimits = {
  tier: KycTier;
  label: string;
  /** montant maximal d'une opération sortante unique (FCFA) */
  perTransaction: number;
  /** total sortant cumulé sur le mois calendaire (FCFA) */
  monthlyOutbound: number;
};

export const KYC_LIMITS: Record<KycTier, TierLimits> = {
  0: { tier: 0, label: 'Compte non vérifié', perTransaction: 50_000, monthlyOutbound: 150_000 },
  1: { tier: 1, label: 'KYC niveau 1', perTransaction: 300_000, monthlyOutbound: 1_500_000 },
  2: { tier: 2, label: 'KYC niveau 2', perTransaction: 2_000_000, monthlyOutbound: 8_000_000 },
};

export function tierFor(kycStatus: KycStatus, kycLevel: number): KycTier {
  if (kycStatus !== 'VERIFIED') return 0;
  return kycLevel >= 2 ? 2 : 1;
}

const OUTBOUND_TYPES: TransactionType[] = ['TRANSFER_OUT', 'WITHDRAWAL', 'FEE'];

export type LimitCheck = {
  allowed: boolean;
  reason?: string;
  tier: TierLimits;
  usedThisMonth: number;
  remainingThisMonth: number;
};

/** Vérifie qu'une opération sortante respecte les plafonds du niveau KYC. */
export async function checkOutboundLimit(userId: string, amount: number): Promise<LimitCheck> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { kycStatus: true, kycLevel: true, wallet: { select: { id: true } } },
  });
  const tier = KYC_LIMITS[tierFor(user?.kycStatus ?? 'NOT_STARTED', user?.kycLevel ?? 0)];

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const walletId = user?.wallet?.id;
  let used = 0;
  if (walletId) {
    const agg = await prisma.ledgerEntry.aggregate({
      where: {
        walletId,
        direction: 'DEBIT',
        type: { in: OUTBOUND_TYPES },
        status: { in: ['COMPLETED', 'PROCESSING'] },
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });
    used = Number(agg._sum.amount ?? 0);
  }

  const remainingThisMonth = Math.max(0, tier.monthlyOutbound - used);

  if (amount > tier.perTransaction) {
    return {
      allowed: false,
      reason: `Cette opération dépasse le plafond par transaction de votre niveau (${tier.label} : ${tier.perTransaction.toLocaleString('fr-FR')} FCFA). Vérifiez votre identité pour l'augmenter.`,
      tier, usedThisMonth: used, remainingThisMonth,
    };
  }
  if (used + amount > tier.monthlyOutbound) {
    return {
      allowed: false,
      reason: `Vous atteindriez votre plafond mensuel (${tier.label} : ${tier.monthlyOutbound.toLocaleString('fr-FR')} FCFA). Il vous reste ${remainingThisMonth.toLocaleString('fr-FR')} FCFA ce mois-ci.`,
      tier, usedThisMonth: used, remainingThisMonth,
    };
  }
  return { allowed: true, tier, usedThisMonth: used, remainingThisMonth };
}
