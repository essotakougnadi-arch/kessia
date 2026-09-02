// ============================================================
// KESSIA — usePrivacy Hook (RGPD / privacy by design §4.5, §59)
// Statut des demandes · export de données · suppression de compte
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend, type ApiResult } from '@/lib/api/client';

export type PrivacyActionResult = { success: boolean; message: string; data?: unknown };
function r(res: ApiResult): PrivacyActionResult {
  return { success: res.success, message: res.message ?? res.error ?? (res.success ? 'OK' : 'Erreur'), data: res.data };
}

export type PrivacyStatus = {
  dataExportRequestedAt: string | null;
  deletionRequestedAt: string | null;
  accountCreatedAt: string;
  consents: { key: string; label: string; grantedAt: string }[];
  exportIncludes: string[];
};

export function usePrivacy() {
  const token = useAuthStore((s) => s.accessToken);

  const status = useSWR<PrivacyStatus>(
    token ? ['/api/v1/profile/privacy', token] : null,
    ([u]: [string, string]) => apiGet(u),
    { revalidateOnFocus: false }
  );

  async function exportData() {
    const res = r(await apiSend('/api/v1/profile/privacy', 'POST', { action: 'export' }));
    if (res.success) {
      const payload = res.data as { generatedAt: string; archive: unknown };
      downloadJson(payload, `kessia-donnees-${new Date().toISOString().slice(0, 10)}.json`);
      status.mutate();
    }
    return res;
  }

  async function requestDeletion(reason?: string) {
    const res = r(await apiSend('/api/v1/profile/privacy', 'POST', { action: 'delete-request', reason }));
    if (res.success) status.mutate();
    return res;
  }

  async function cancelDeletion() {
    const res = r(await apiSend('/api/v1/profile/privacy', 'POST', { action: 'cancel-delete' }));
    if (res.success) status.mutate();
    return res;
  }

  return {
    status: status.data ?? null,
    isLoading: status.isLoading,
    error: status.error as Error | undefined,
    refresh: () => status.mutate(),
    exportData,
    requestDeletion,
    cancelDeletion,
  };
}

function downloadJson(data: unknown, filename: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
