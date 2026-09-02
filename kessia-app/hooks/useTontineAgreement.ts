// ============================================================
// KESSIA — useTontineAgreement Hook (§6.4)
// Contrat numérique de la tontine + journal d'événements
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend } from '@/lib/api/client';
import type { AgreementTerms } from '@/lib/tontine/agreement';
import type { TontineEventType } from '@prisma/client';

export type AgreementResponse = {
  finalized: boolean;
  generatedAt: string | null;
  terms: AgreementTerms;
  acceptances: { userId: string; name: string; position: number | null; acceptedAt: string | null }[];
  myAcceptance: string | null;
  events: { id: string; type: TontineEventType; label: string; round: number | null; amount: number | null; at: string }[];
};

export function useTontineAgreement(tontineId: string, enabled = true) {
  const token = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<AgreementResponse>(
    token && tontineId && enabled ? [`/api/v1/tontine/${tontineId}/agreement`, token] : null,
    ([u]: [string, string]) => apiGet(u),
    { revalidateOnFocus: false }
  );

  async function accept() {
    const r = await apiSend(`/api/v1/tontine/${tontineId}/agreement`, 'POST', { action: 'accept' });
    if (r.success) mutate();
    return { success: r.success, message: r.message ?? r.error ?? 'Erreur' };
  }

  return {
    agreement: data ?? null,
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    accept,
  };
}
