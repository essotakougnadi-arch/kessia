// ============================================================
// KESSIA — Hooks back-office (§45)
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiRequest, apiSend, type ApiResult } from '@/lib/api/client';
import type { KycStatus, TicketPriority, TicketStatus, UserRole } from '@prisma/client';
import type { PlatformAnalytics } from '@/lib/analytics/platform';
import type { AdminPriority } from '@/lib/admin/copilot';

function toActionResult(r: ApiResult) {
  return { success: r.success, message: r.message ?? r.error ?? (r.success ? 'OK' : 'Erreur') };
}

export type AdminOverview = {
  users: { total: number; thisMonth: number };
  kyc: { pending: number };
  tontines: { active: number };
  support: { open: number };
  transactions: { count: number; volume: number; currency: string };
  recentUsers: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    role: UserRole;
    kycStatus: KycStatus;
    createdAt: string;
  }[];
};

export function useAdminOverview() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<{ data?: AdminOverview; status: number }>(
    accessToken ? ['/api/v1/admin/overview', accessToken] : null,
    async ([url]: [string, string]) => {
      const res = await apiRequest<AdminOverview>(url, { method: 'GET' });
      if (!res.success) {
        const err = new Error(res.error ?? 'Erreur') as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return { data: res.data, status: res.status };
    },
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const err = error as (Error & { status?: number }) | undefined;

  return {
    overview: data?.data ?? null,
    isLoading,
    forbidden: err?.status === 403,
    error: err,
    refresh: () => mutate(),
  };
}

// ── Listes back-office ──────────────────────────────────────

function useAdminList<T>(path: string) {
  const token = useAuthStore((s) => s.accessToken);
  const { data, error, isLoading, mutate } = useSWR<T>(
    token ? [path, token] : null,
    ([u]: [string, string]) => apiGet<T>(u),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  return { data: data ?? null, isLoading, error: error as Error | undefined, refresh: () => mutate() };
}

export type AdminUserRow = {
  id: string; firstName: string; lastName: string; phone: string; email: string | null;
  role: UserRole; kycStatus: KycStatus; kycLevel: number; isActive: boolean;
  balance: number; createdAt: string; lastLoginAt: string | null;
};
export function useAdminUsers(q: string, kyc: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (kyc) params.set('kyc', kyc);
  const list = useAdminList<{ users: AdminUserRow[]; meta: { total: number } }>(
    `/api/v1/admin/users${params.toString() ? `?${params}` : ''}`
  );

  async function moderate(id: string, action: 'suspend' | 'reactivate', reason?: string) {
    const r = toActionResult(await apiSend(`/api/v1/admin/users/${id}`, 'PATCH', { action, reason }));
    if (r.success) list.refresh();
    return r;
  }

  return { ...list, moderate };
}

export type AdminKycCase = {
  id: string; status: KycStatus; level: number; rejectionReason: string | null;
  submittedAt: string | null; createdAt: string;
  user: { id: string; firstName: string; lastName: string; phone: string };
  documents: { id: string; type: string; status: string; uploadedAt: string }[];
};
export function useAdminKycList(status = 'UNDER_REVIEW') {
  return useAdminList<AdminKycCase[]>(`/api/v1/admin/kyc?status=${status}`);
}

export type AdminKycDetail = {
  id: string; status: KycStatus; level: number; rejectionReason: string | null;
  submittedAt: string | null; createdAt: string;
  user: { id: string; firstName: string; lastName: string; phone: string; email: string | null };
  documents: { id: string; type: string; status: string; notes: string | null; uploadedAt: string; fileUrl: string }[];
};
export function useAdminKycCase(id: string | null) {
  const token = useAuthStore((s) => s.accessToken);
  const { data, error, isLoading, mutate } = useSWR<AdminKycDetail>(
    token && id ? [`/api/v1/admin/kyc/${id}`, token] : null,
    ([u]: [string, string]) => apiGet<AdminKycDetail>(u),
    { revalidateOnFocus: false }
  );

  async function review(decision: 'VERIFIED' | 'REJECTED' | 'ACTION_REQUIRED', reason?: string, level?: number) {
    const r = toActionResult(await apiSend(`/api/v1/admin/kyc/${id}`, 'PATCH', { decision, reason, level }));
    if (r.success) mutate();
    return r;
  }

  return { kycCase: data ?? null, isLoading, error: error as Error | undefined, review, refresh: () => mutate() };
}

export type AdminTx = {
  id: string; type: string; direction: string; amount: number; currency: string;
  status: string; description: string | null; reference: string | null; createdAt: string;
  user: { firstName: string; lastName: string; phone: string };
};
export function useAdminTransactions(q: string, status: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  return useAdminList<{
    entries: AdminTx[];
    totals: { completedVolume: number; completedCount: number };
    meta: { total: number };
  }>(`/api/v1/admin/transactions${params.toString() ? `?${params}` : ''}`);
}

export type AdminTontine = {
  id: string; name: string; status: string; type: string; amount: number; frequency: string;
  currentRound: number; totalRounds: number; memberCount: number; contributionCount: number;
  createdBy: { firstName: string; lastName: string; phone: string }; createdAt: string;
  escrow: { hasWallet: boolean; held: number; expectedHeld: number; drift: number; balanced: boolean };
};
export function useAdminTontines() {
  return useAdminList<AdminTontine[]>('/api/v1/admin/tontines');
}

export type AdminTicket = {
  id: string; ticketNumber: string; subject: string; category: string;
  priority: TicketPriority; status: TicketStatus; messageCount: number;
  user: { firstName: string; lastName: string; phone: string };
  assignedTo: { firstName: string; lastName: string } | null;
  createdAt: string; updatedAt: string;
};
export function useAdminSupport() {
  return useAdminList<AdminTicket[]>('/api/v1/admin/support');
}

export type ModuleInterestRow = { key: string; name: string; status: string; ref: string; interested: number };
export function useAdminModules() {
  return useAdminList<{ total: number; modules: ModuleInterestRow[] }>('/api/v1/admin/modules');
}

// ── Anti-fraude (§32) ─────────────────────────────────────
export type FraudAlertRow = {
  id: string;
  user: { firstName: string; lastName: string; phone: string };
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  score: number;
  signals: { type: string; label: string; weight: number }[];
  context: string;
  entityId: string | null;
  status: 'OPEN' | 'REVIEWING' | 'CONFIRMED' | 'DISMISSED';
  decisionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};
export type FraudView = {
  summary: { open: number; reviewing: number; confirmed: number; dismissed: number };
  alerts: FraudAlertRow[];
};
// ── Analytics + Copilot (§28, §17) ────────────────────────
export function useAdminAnalytics() {
  return useAdminList<{ analytics: PlatformAnalytics; priorities: AdminPriority[] }>('/api/v1/admin/analytics');
}

export function useAdminFraud(status = '') {
  const list = useAdminList<FraudView>(`/api/v1/admin/fraud${status ? `?status=${status}` : ''}`);
  async function review(id: string, next: 'REVIEWING' | 'CONFIRMED' | 'DISMISSED', note?: string) {
    const r = toActionResult(await apiSend(`/api/v1/admin/fraud/${id}`, 'PATCH', { status: next, note }));
    if (r.success) list.refresh();
    return r;
  }
  return { ...list, review };
}

export type AdminTicketDetail = {
  id: string; ticketNumber: string; subject: string; description: string;
  category: string; priority: TicketPriority; status: TicketStatus;
  createdAt: string; updatedAt: string; resolvedAt: string | null; closedAt: string | null;
  user: { id: string; firstName: string; lastName: string; phone: string; email: string | null };
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  messages: { id: string; authorId: string; content: string; isInternal: boolean; createdAt: string }[];
};

// ── Fonds de Garantie Solidaire (§6.5) ─────────────────────

export type GuaranteeAdminView = {
  mode: 'SIMULATION';
  fund: {
    currency: string;
    allocationRatePct: number;
    tontineContributionsTotal: number;
    projectedContributions: number;
    claimsSettledTotal: number;
    projectedBalance: number;
    claims: { pending: number; approved: number; settled: number; rejected: number };
    coverageRatio: number | null;
  };
  claims: {
    id: string; user: { firstName: string; lastName: string; phone: string };
    tontineId: string | null; round: number | null; amount: number; reason: string;
    status: string; decisionNote: string | null; createdAt: string; reviewedAt: string | null;
  }[];
  events: { id: string; type: string; amount: number | null; at: string }[];
};

export function useAdminGuarantee(status = '') {
  const token = useAuthStore((s) => s.accessToken);
  const path = `/api/v1/admin/guarantee${status ? `?status=${status}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<GuaranteeAdminView>(
    token ? [path, token] : null,
    ([u]: [string, string]) => apiGet<GuaranteeAdminView>(u),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  async function review(claimId: string, decision: 'APPROVED' | 'REJECTED', note: string) {
    const r = toActionResult(await apiSend(`/api/v1/admin/guarantee/claims/${claimId}`, 'PATCH', { decision, note }));
    if (r.success) mutate();
    return r;
  }

  return { data: data ?? null, isLoading, error: error as Error | undefined, refresh: () => mutate(), review };
}

export function useAdminTicket(id: string | null) {
  const token = useAuthStore((s) => s.accessToken);
  const { data, error, isLoading, mutate } = useSWR<AdminTicketDetail>(
    token && id ? [`/api/v1/admin/support/${id}`, token] : null,
    ([u]: [string, string]) => apiGet<AdminTicketDetail>(u),
    { revalidateOnFocus: false }
  );

  async function act(payload: Record<string, unknown>) {
    const r = toActionResult(await apiSend(`/api/v1/admin/support/${id}`, 'PATCH', payload));
    if (r.success) mutate();
    return r;
  }

  return {
    ticket: data ?? null,
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    assignToMe: () => act({ action: 'assign' }),
    unassign: () => act({ action: 'unassign' }),
    setStatus: (status: TicketStatus) => act({ action: 'status', status }),
    reply: (content: string, internal = false) => act({ action: 'reply', content, internal }),
  };
}
