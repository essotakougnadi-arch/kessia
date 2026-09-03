// ============================================================
// KESSIA — useJoinRequests Hook
// Panneau gestionnaire : demandes d'adhésion à une tontine.
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend, type ApiResult } from '@/lib/api/client';
import type { JoinRequestStatus, KycStatus } from '@prisma/client';

export type JoinRequestRow = {
  id: string;
  status: JoinRequestStatus;
  message: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  user: {
    id: string;
    name: string;
    phone: string;
    kycStatus: KycStatus;
    city: string | null;
    country: string | null;
  };
};

export type ActionResult = { success: boolean; message: string };

function toActionResult(r: ApiResult): ActionResult {
  return {
    success: r.success,
    message: r.message ?? r.error ?? (r.success ? 'Fait.' : 'Une erreur est survenue.'),
  };
}

export function useJoinRequests(tontineId: string, enabled: boolean) {
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<JoinRequestRow[]>(
    accessToken && tontineId && enabled
      ? [`/api/v1/tontine/${tontineId}/join-requests?status=PENDING`, accessToken]
      : null,
    ([url]: [string, string]) => apiGet<JoinRequestRow[]>(url),
    { revalidateOnFocus: false }
  );

  async function decide(requestId: string, action: 'approve' | 'reject', note?: string): Promise<ActionResult> {
    const r = toActionResult(
      await apiSend(`/api/v1/tontine/${tontineId}/join-requests/${requestId}`, 'PATCH', { action, note })
    );
    if (r.success) mutate();
    return r;
  }

  return {
    requests: data ?? [],
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    decide,
  };
}
