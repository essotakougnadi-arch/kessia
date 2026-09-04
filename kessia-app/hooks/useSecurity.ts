// ============================================================
// KESSIA — useSecurity Hook (§31)
// 2FA · changement de mot de passe · sessions actives
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiRequest, apiSend, type ApiResult } from '@/lib/api/client';

export type ActionResult = { success: boolean; message: string; data?: unknown };
function r(res: ApiResult): ActionResult {
  return { success: res.success, message: res.message ?? res.error ?? (res.success ? 'OK' : 'Erreur'), data: res.data };
}

export type SessionRow = {
  id: string; device: string; ipAddress: string | null;
  createdAt: string; lastUsedAt: string; current: boolean;
};

export function useSecurity() {
  const token = useAuthStore((s) => s.accessToken);

  const twofa = useSWR<{ enabled: boolean; backupCodesRemaining: number }>(
    token ? ['/api/v1/auth/2fa', token] : null,
    ([u]: [string, string]) => apiGet(u),
    { revalidateOnFocus: false }
  );

  const sessions = useSWR<SessionRow[]>(
    token ? ['/api/v1/auth/sessions', token] : null,
    ([u]: [string, string]) => apiGet(u),
    { revalidateOnFocus: false }
  );

  const pin = useSWR<{ enabled: boolean }>(
    token ? ['/api/v1/auth/pin', token] : null,
    ([u]: [string, string]) => apiGet(u),
    { revalidateOnFocus: false }
  );

  async function start2fa() {
    return r(await apiSend('/api/v1/auth/2fa', 'POST', { step: 'setup' }));
  }
  async function enable2fa(code: string) {
    const res = r(await apiSend('/api/v1/auth/2fa', 'POST', { step: 'enable', code }));
    if (res.success) twofa.mutate();
    return res;
  }
  async function disable2fa(code: string) {
    const res = r(await apiRequest('/api/v1/auth/2fa', { method: 'DELETE', body: JSON.stringify({ code }) }));
    if (res.success) twofa.mutate();
    return res;
  }
  async function changePassword(currentPassword: string, newPassword: string) {
    return r(await apiSend('/api/v1/auth/change-password', 'POST', { currentPassword, newPassword }));
  }
  async function revokeSession(id: string) {
    const res = r(await apiRequest(`/api/v1/auth/sessions?id=${id}`, { method: 'DELETE' }));
    if (res.success) sessions.mutate();
    return res;
  }
  async function revokeOthers() {
    const res = r(await apiRequest('/api/v1/auth/sessions?all=true', { method: 'DELETE' }));
    if (res.success) sessions.mutate();
    return res;
  }
  async function enablePin(newPin: string) {
    const res = r(await apiSend('/api/v1/auth/pin', 'POST', { pin: newPin }));
    if (res.success) pin.mutate();
    return res;
  }
  async function disablePin() {
    const res = r(await apiRequest('/api/v1/auth/pin', { method: 'DELETE' }));
    if (res.success) pin.mutate();
    return res;
  }

  return {
    twoFactorEnabled: twofa.data?.enabled ?? false,
    backupCodesRemaining: twofa.data?.backupCodesRemaining ?? 0,
    sessions: sessions.data ?? [],
    pinEnabled: pin.data?.enabled ?? false,
    isLoading: twofa.isLoading || sessions.isLoading,
    start2fa, enable2fa, disable2fa, changePassword, revokeSession, revokeOthers,
    enablePin, disablePin,
  };
}
