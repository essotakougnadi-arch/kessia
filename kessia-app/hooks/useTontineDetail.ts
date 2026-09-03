// ============================================================
// KESSIA — useTontineDetail Hook
// Détail d'une tontine + action « cotiser »
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend, type ApiResult } from '@/lib/api/client';
import type {
  ContributionStatus,
  JoinRequestStatus,
  MemberStatus,
  PurchaseMode,
  TontineFrequency,
  TontineStatus,
  TontineType,
} from '@prisma/client';

type UserLite = { id: string; firstName: string; lastName: string; phone: string };

export type TontineMemberDetail = {
  id: string;
  userId: string;
  status: MemberStatus;
  orderPosition: number | null;
  totalContributed: number;
  totalReceived: number;
  joinedAt: string;
  user: UserLite;
};

export type TontineContributionDetail = {
  id: string;
  memberId: string;
  round: number;
  amount: number;
  status: ContributionStatus;
  dueDate: string;
  paidAt: string | null;
};

export type TontineScheduleDetail = {
  id: string;
  round: number;
  dueDate: string;
  recipientId: string | null;
  isPaid: boolean;
  paidAt: string | null;
};

export type TontineDetail = {
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
  rules: string | null;
  isPublic: boolean;
  membershipConditions: string | null;
  inviteCode: string;
  status: TontineStatus;
  createdById: string;
  currentRound: number;
  totalRounds: number;
  nextContributionDate: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: UserLite;
  members: TontineMemberDetail[];
  contributions: TontineContributionDetail[];
  schedules: TontineScheduleDetail[];
  memberCount: number;
  isMember: boolean;
  isCreator: boolean;
  /** demande d'adhésion de l'utilisateur courant (null si membre ou aucune) */
  myJoinRequest: { status: JoinRequestStatus; decisionNote: string | null; createdAt: string } | null;
  /** nombre de demandes en attente (visible uniquement par le gestionnaire) */
  pendingJoinRequestCount: number;
  /** séquestre (§6.5) — présent dès que la tontine est ACTIVE/COMPLETED */
  escrow: { held: number; expectedHeld: number; balanced: boolean } | null;
};

export type ActionResult = { success: boolean; message: string };

function toActionResult(r: ApiResult): ActionResult {
  return {
    success: r.success,
    message: r.message ?? r.error ?? (r.success ? 'Opération réussie.' : 'Une erreur est survenue.'),
  };
}

export function useTontineDetail(id: string) {
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<TontineDetail>(
    accessToken && id ? [`/api/v1/tontine/${id}`, accessToken] : null,
    ([url]: [string, string]) => apiGet<TontineDetail>(url),
    { revalidateOnFocus: false }
  );

  async function contribute(round: number): Promise<ActionResult> {
    const result = toActionResult(
      await apiSend(`/api/v1/tontine/${id}/contribute`, 'POST', { round })
    );
    if (result.success) mutate();
    return result;
  }

  async function startTontine(): Promise<ActionResult> {
    const result = toActionResult(
      await apiSend(`/api/v1/tontine/${id}`, 'PATCH', { action: 'start' })
    );
    if (result.success) mutate();
    return result;
  }

  async function requestJoin(message?: string): Promise<ActionResult> {
    const result = toActionResult(
      await apiSend(`/api/v1/tontine/${id}/join-requests`, 'POST', { message })
    );
    if (result.success) mutate();
    return result;
  }

  async function cancelJoinRequest(): Promise<ActionResult> {
    // l'API accepte requestId — on route via la ressource "ma demande"
    const result = toActionResult(
      await apiSend(`/api/v1/tontine/${id}/join-requests/me`, 'PATCH', { action: 'cancel' })
    );
    if (result.success) mutate();
    return result;
  }

  return {
    tontine: data ?? null,
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    contribute,
    startTontine,
    requestJoin,
    cancelJoinRequest,
  };
}
