// ============================================================
// KESSIA — useBusinessPlan Hook (Business Plan AI §17)
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend } from '@/lib/api/client';
import type { BusinessPlanContent } from '@/lib/business/plan-shared';

export type { BusinessPlanContent };

type PlanPayload = { content: BusinessPlanContent; generatedAt: string; updatedAt: string; exists: boolean };

export function useBusinessPlan(businessId: string, enabled: boolean) {
  const token = useAuthStore((s) => s.accessToken);
  const path = `/api/v1/business/${businessId}/plan`;

  const { data, error, isLoading, mutate } = useSWR<PlanPayload>(
    token && businessId && enabled ? [path, token] : null,
    ([u]: [string, string]) => apiGet<PlanPayload>(u),
    { revalidateOnFocus: false }
  );

  async function save(content: BusinessPlanContent) {
    const r = await apiSend(path, 'PUT', content as unknown as Record<string, unknown>);
    if (r.success) mutate();
    return { success: r.success, message: r.message ?? r.error ?? 'Erreur' };
  }

  async function regenerate() {
    const r = await apiSend(path, 'POST', { action: 'regenerate' });
    if (r.success) mutate();
    return { success: r.success, message: r.message ?? r.error ?? 'Erreur' };
  }

  return {
    plan: data?.content ?? null,
    generatedAt: data?.generatedAt ?? null,
    updatedAt: data?.updatedAt ?? null,
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    save,
    regenerate,
  };
}
