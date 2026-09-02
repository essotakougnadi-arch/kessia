// ============================================================
// KESSIA — useBusinesses Hook
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend, type ApiResult } from '@/lib/api/client';
import type { BusinessStatus } from '@prisma/client';

export type Business = {
  id: string;
  name: string;
  sector: string;
  description: string | null;
  phone: string | null;
  city: string | null;
  logo: string | null;
  status: BusinessStatus;
  createdAt: string;
  _count: { products: number; sales: number; customers: number };
};

export type CreateBusinessPayload = {
  name: string;
  sector: string;
  description?: string;
  phone?: string;
  city?: string;
};

export type ActionResult = { success: boolean; message: string };

function toActionResult(r: ApiResult): ActionResult {
  return {
    success: r.success,
    message: r.message ?? r.error ?? (r.success ? 'Opération réussie.' : 'Une erreur est survenue.'),
  };
}

export function useBusinesses() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<Business[]>(
    accessToken ? ['/api/v1/business', accessToken] : null,
    ([url]: [string, string]) => apiGet<Business[]>(url),
    { revalidateOnFocus: false }
  );

  async function createBusiness(payload: CreateBusinessPayload): Promise<ActionResult> {
    const result = toActionResult(await apiSend('/api/v1/business', 'POST', payload));
    if (result.success) mutate();
    return result;
  }

  return {
    businesses: data ?? [],
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    createBusiness,
  };
}
