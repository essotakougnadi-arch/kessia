// ============================================================
// KESSIA — useWallet Hook
// Solde, stats 30j, transactions + actions (dépôt / transfert)
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend, type ApiResult } from '@/lib/api/client';
import type { Direction, TransactionStatus, TransactionType } from '@prisma/client';

export type WalletData = {
  id: string;
  balance: number;
  currency: string;
  isLocked: boolean;
  createdAt: string;
  stats: {
    monthlyIn: number;
    monthlyOut: number;
    totalTransactions: number;
  };
};

export type WalletTransaction = {
  id: string;
  type: TransactionType;
  direction: Direction;
  amount: number;
  currency: string;
  balanceBefore: number;
  balanceAfter: number;
  status: TransactionStatus;
  description: string | null;
  createdAt: string;
};

export type DepositMethod = 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH';
export type ActionResult = { success: boolean; message: string };

function toActionResult(r: ApiResult): ActionResult {
  return {
    success: r.success,
    message: r.message ?? r.error ?? (r.success ? 'Opération réussie.' : 'Une erreur est survenue.'),
  };
}

export function useWallet() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const wallet = useSWR<WalletData>(
    accessToken ? ['/api/v1/wallet', accessToken] : null,
    ([url]: [string, string]) => apiGet<WalletData>(url),
    { revalidateOnFocus: false }
  );

  const tx = useSWR<{ entries: WalletTransaction[]; meta: unknown }>(
    accessToken ? ['/api/v1/wallet/transactions', accessToken] : null,
    ([url]: [string, string]) => apiGet<{ entries: WalletTransaction[]; meta: unknown }>(url),
    { revalidateOnFocus: false }
  );

  const refresh = () => {
    wallet.mutate();
    tx.mutate();
  };

  async function deposit(
    amount: number,
    method: DepositMethod = 'MOBILE_MONEY'
  ): Promise<ActionResult> {
    const result = toActionResult(
      await apiSend('/api/v1/wallet/deposit', 'POST', { amount, method })
    );
    if (result.success) refresh();
    return result;
  }

  async function transfer(
    recipientPhone: string,
    amount: number,
    description?: string
  ): Promise<ActionResult> {
    const result = toActionResult(
      await apiSend('/api/v1/wallet/transfer', 'POST', {
        recipientPhone,
        amount,
        ...(description ? { description } : {}),
      })
    );
    if (result.success) refresh();
    return result;
  }

  async function withdraw(
    amount: number,
    method: DepositMethod = 'MOBILE_MONEY',
    account?: string
  ): Promise<ActionResult> {
    const result = toActionResult(
      await apiSend('/api/v1/payments', 'POST', {
        direction: 'OUTBOUND',
        method,
        amount,
        ...(account ? { account } : {}),
      })
    );
    if (result.success) refresh();
    return result;
  }

  return {
    wallet: wallet.data ?? null,
    stats: wallet.data?.stats ?? null,
    transactions: tx.data?.entries ?? [],
    isLoading: wallet.isLoading || tx.isLoading,
    error: (wallet.error ?? tx.error) as Error | undefined,
    refresh,
    deposit,
    transfer,
    withdraw,
  };
}
