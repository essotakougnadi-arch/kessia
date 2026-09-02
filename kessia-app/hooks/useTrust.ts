'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet } from '@/lib/api/client';
import type { FeeLine } from '@/lib/fees';
import type { TierLimits } from '@/lib/kyc/limits';

export type TrustView = {
  fees: FeeLine[];
  kyc: {
    status: string; level: number; tier: 0 | 1 | 2;
    limits: TierLimits; allTiers: TierLimits[];
    usedThisMonth: number; remainingThisMonth: number;
  };
  dataRights: { exportRequestedAt: string | null; deletionRequestedAt: string | null; manageUrl: string };
  legal: {
    acceptedVersion: string | null;
    acceptedAt: string | null;
    currentVersion: string;
    currentVersionLabel: string;
    upToDate: boolean;
  };
  security: { twoFactorEnabled: boolean; activeSessions: number; manageUrl: string };
  guaranteeFund: { mode: 'SIMULATION'; projectedBalance: number; note: string };
  disclaimers: string[];
};

export function useTrust() {
  const token = useAuthStore((s) => s.accessToken);
  const { data, error, isLoading, mutate } = useSWR<TrustView>(
    token ? ['/api/v1/trust', token] : null,
    ([u]: [string, string]) => apiGet<TrustView>(u),
    { revalidateOnFocus: false }
  );
  return { trust: data ?? null, isLoading, error: error as Error | undefined, refresh: () => mutate() };
}
