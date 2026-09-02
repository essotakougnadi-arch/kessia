// ============================================================
// KESSIA — useExplore Hook (§9–§16)
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend, apiRequest } from '@/lib/api/client';

export function useExplore() {
  const token = useAuthStore((s) => s.accessToken);

  const { data, isLoading, mutate } = useSWR<{ modules: string[] }>(
    token ? ['/api/v1/modules/interest', token] : null,
    ([u]: [string, string]) => apiGet(u),
    { revalidateOnFocus: false }
  );

  const interested = new Set(data?.modules ?? []);

  async function toggle(module: string) {
    const on = interested.has(module);
    const r = on
      ? await apiRequest(`/api/v1/modules/interest?module=${module}`, { method: 'DELETE' })
      : await apiSend('/api/v1/modules/interest', 'POST', { module });
    if (r.success) mutate();
    return { success: r.success, message: r.message ?? r.error ?? 'Erreur', on: !on };
  }

  return { interested, isLoading, toggle };
}
