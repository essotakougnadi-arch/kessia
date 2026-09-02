// ============================================================
// KESSIA — useTontines Hook
// Liste des tontines de l'utilisateur + création
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend, type ApiResult } from '@/lib/api/client';
import type { TontineFrequency, TontineStatus, TontineType, PurchaseMode } from '@prisma/client';

export type TontineSummary = {
  id: string;
  name: string;
  description: string | null;
  type: TontineType;
  purchaseMode: PurchaseMode;
  purchaseItem: string | null;
  targetAmount: number | null;
  amount: number;
  currency: string;
  frequency: TontineFrequency;
  startDate: string;
  maxMembers: number;
  status: TontineStatus;
  inviteCode: string;
  isPublic: boolean;
  currentRound: number;
  totalRounds: number;
  nextContributionDate: string | null;
  memberCount: number;
  myMembership: {
    id: string;
    orderPosition: number | null;
    totalContributed: string;
    totalReceived: string;
    status: string;
  } | null;
  isCreator: boolean;
  createdAt: string;
};

export type ActionResult = { success: boolean; message: string };

export type CreateTontinePayload = {
  name: string;
  amount: number;
  frequency: TontineFrequency;
  startDate: string; // ISO datetime
  maxMembers: number;
  description?: string;
  type?: TontineType;
  /** Achat : 'GROUP' (défaut) ou 'SOLO' (achat individuel). */
  purchaseMode?: PurchaseMode;
  /** Achat solo : article visé, prix cible, nombre de versements. */
  purchaseItem?: string;
  targetAmount?: number;
  plannedRounds?: number;
};

function toActionResult(r: ApiResult): ActionResult {
  return {
    success: r.success,
    message: r.message ?? r.error ?? (r.success ? 'Opération réussie.' : 'Une erreur est survenue.'),
  };
}

export function useTontines(status?: TontineStatus) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const url = status ? `/api/v1/tontine?status=${status}` : '/api/v1/tontine';

  const { data, error, isLoading, mutate } = useSWR<TontineSummary[]>(
    accessToken ? [url, accessToken] : null,
    ([u]: [string, string]) => apiGet<TontineSummary[]>(u),
    { revalidateOnFocus: false }
  );

  const refresh = () => mutate();

  async function createTontine(payload: CreateTontinePayload): Promise<ActionResult> {
    const result = toActionResult(await apiSend('/api/v1/tontine', 'POST', payload));
    if (result.success) refresh();
    return result;
  }

  async function joinByCode(code: string): Promise<ActionResult & { tontineId?: string }> {
    const res = await apiSend<{ tontineId?: string }>('/api/v1/tontine/join', 'POST', { code });
    const result = toActionResult(res);
    if (result.success) refresh();
    return { ...result, tontineId: res.data?.tontineId };
  }

  return {
    tontines: data ?? [],
    isLoading,
    error: error as Error | undefined,
    refresh,
    createTontine,
    joinByCode,
  };
}
