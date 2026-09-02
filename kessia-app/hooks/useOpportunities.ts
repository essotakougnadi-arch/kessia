// ============================================================
// KESSIA — useOpportunities Hook (§17)
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet } from '@/lib/api/client';
import type { Opportunity } from '@/lib/opportunities/engine';

export function useOpportunities() {
  const token = useAuthStore((s) => s.accessToken);

  const { data, isLoading, mutate } = useSWR<{ opportunities: Opportunity[] }>(
    token ? ['/api/v1/opportunities', token] : null,
    ([u]: [string, string]) => apiGet(u),
    { revalidateOnFocus: false }
  );

  return {
    opportunities: data?.opportunities ?? [],
    isLoading,
    refresh: () => mutate(),
  };
}
