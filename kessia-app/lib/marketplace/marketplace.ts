// ============================================================
// KESSIA — Marketplace : logique pure (§16)
// ============================================================

import type { MarketplaceItemStatus } from '@prisma/client';

/** Montant par versement pour un achat par tontine (prix ÷ versements, plancher 1). */
export function installmentAmount(price: number, installments: number): number {
  if (!(price > 0) || !(installments >= 2)) return 0;
  return Math.max(1, Math.round(price / installments));
}

export interface BuyabilityInput {
  status: MarketplaceItemStatus;
  stock: number;
  isSeller: boolean;
  mode: 'WALLET' | 'TONTINE';
  payableByTontine: boolean;
  /** solde du wallet acheteur (mode WALLET uniquement) */
  buyerBalance?: number;
  price: number;
}

export type BuyabilityCode =
  | 'OK'
  | 'IS_SELLER'
  | 'NOT_ACTIVE'
  | 'OUT_OF_STOCK'
  | 'TONTINE_NOT_ALLOWED'
  | 'INSUFFICIENT_BALANCE';

/** Peut-on passer cette commande ? */
export function describeBuyability(i: BuyabilityInput): { code: BuyabilityCode; ok: boolean } {
  if (i.isSeller) return { code: 'IS_SELLER', ok: false };
  if (i.status !== 'ACTIVE') return { code: 'NOT_ACTIVE', ok: false };
  if (i.stock <= 0) return { code: 'OUT_OF_STOCK', ok: false };
  if (i.mode === 'TONTINE' && !i.payableByTontine) return { code: 'TONTINE_NOT_ALLOWED', ok: false };
  if (i.mode === 'WALLET' && (i.buyerBalance ?? 0) < i.price) {
    return { code: 'INSUFFICIENT_BALANCE', ok: false };
  }
  return { code: 'OK', ok: true };
}
