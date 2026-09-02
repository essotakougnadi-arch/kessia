// ============================================================
// KESSIA — useGuarantee Hook (§6.5)
// Fonds de Garantie Solidaire — vue utilisateur (mode démonstration)
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend } from '@/lib/api/client';
import type { GuaranteeClaimStatus } from '@prisma/client';

export type GuaranteeView = {
  mode: 'SIMULATION';
  requestsEnabled: boolean;
  rules: {
    allocationRatePct: number;
    minOnTimeContributions: number;
    minMembershipDays: number;
    maxApprovedClaimsPerYear: number;
    kycVerified: boolean;
  };
  fund: {
    currency: string;
    allocationRatePct: number;
    tontineContributionsTotal: number;
    projectedContributions: number;
    claimsSettledTotal: number;
    projectedBalance: number;
    claims: { pending: number; approved: number; settled: number; rejected: number };
    coverageRatio: number | null;
  };
  eligibility: { eligible: boolean; reasons: string[] };
  claims: {
    id: string; tontineId: string | null; round: number | null; amount: number;
    reason: string; status: GuaranteeClaimStatus; decisionNote: string | null;
    createdAt: string; reviewedAt: string | null;
  }[];
};

export function useGuarantee() {
  const token = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<GuaranteeView>(
    token ? ['/api/v1/guarantee', token] : null,
    ([u]: [string, string]) => apiGet(u),
    { revalidateOnFocus: false }
  );

  async function requestHelp(input: { tontineId: string; round: number; reason: string }) {
    const r = await apiSend('/api/v1/guarantee/claims', 'POST', input);
    if (r.success) mutate();
    return { success: r.success, message: r.message ?? r.error ?? 'Erreur' };
  }

  return {
    data: data ?? null,
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    requestHelp,
  };
}
