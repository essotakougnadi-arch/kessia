// ============================================================
// KESSIA — useGrowth Hook (plan de croissance §23)
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend } from '@/lib/api/client';
import type { GrowthPlan } from '@/lib/growth/plan';

export type GrowthStepStatus = 'TODO' | 'DOING' | 'DONE' | 'SKIPPED';

export function useGrowth() {
  const token = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<GrowthPlan>(
    token ? ['/api/v1/growth', token] : null,
    ([u]: [string, string]) => apiGet<GrowthPlan>(u),
    { revalidateOnFocus: false }
  );

  async function setStep(key: string, status: GrowthStepStatus, note?: string) {
    const r = await apiSend(`/api/v1/growth/steps/${encodeURIComponent(key)}`, 'PATCH', { status, note });
    if (r.success) mutate();
    return { success: r.success, message: r.message ?? r.error ?? 'Erreur' };
  }

  return {
    plan: data ?? null,
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    setStep,
  };
}
