// ============================================================
// KESSIA — useInsights Hook (Smart Alerts §5, §7)
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet } from '@/lib/api/client';

export type Insight = {
  id: string;
  kind: 'action' | 'warn' | 'tip' | 'celebrate';
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  priority: number;
};

export function useInsights() {
  const token = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<{ insights: Insight[] }>(
    token ? ['/api/v1/ai/insights', token] : null,
    ([u]: [string, string]) => apiGet(u),
    { revalidateOnFocus: false }
  );

  return {
    insights: data?.insights ?? [],
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
  };
}
