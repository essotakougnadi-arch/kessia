// ============================================================
// KESSIA — Client API authentifié (centralisé)
// - Ajoute le header Authorization: Bearer <accessToken>
// - Sur 401 : tente un refresh (dédupliqué), rejoue la requête une fois
// - Si le refresh échoue : logout + redirection vers /login
// ============================================================

'use client';

import { useAuthStore } from '@/store/authStore';

export type ApiResult<T = unknown> = {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  status: number;
};

// ── Refresh dédupliqué ──────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const { refreshToken, logout, setTokens, updateUser } = useAuthStore.getState();

  if (!refreshToken) {
    logout();
    return false;
  }

  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success || !json.data?.accessToken) {
      logout();
      return false;
    }

    setTokens(json.data.accessToken, json.data.refreshToken);
    if (json.data.user) updateUser(json.data.user);
    return true;
  } catch {
    logout();
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/login')) return;
  const from = window.location.pathname + window.location.search;
  window.location.href = `/login?from=${encodeURIComponent(from)}`;
}

// ── Requête ─────────────────────────────────────────────────

function resolveUrl(path: string): string {
  if (path.startsWith('/') || path.startsWith('http')) return path;
  return `/api/v1/${path}`;
}

export async function apiRequest<T = unknown>(
  path: string,
  init: RequestInit = {},
  retried = false
): Promise<ApiResult<T>> {
  const token = useAuthStore.getState().accessToken;

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(resolveUrl(path), { ...init, headers });
  } catch {
    return { success: false, error: 'Erreur réseau. Vérifiez votre connexion.', status: 0 };
  }

  // Token expiré → refresh + rejeu unique
  if (res.status === 401 && !retried && token) {
    const refreshed = await refreshOnce();
    if (refreshed) return apiRequest<T>(path, init, true);
    redirectToLogin();
    return { success: false, error: 'Session expirée. Veuillez vous reconnecter.', status: 401 };
  }

  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: T; message?: string; error?: string }
    | null;

  return {
    success: res.ok && (json?.success ?? true),
    data: json?.data,
    message: json?.message,
    error: json?.error,
    status: res.status,
  };
}

/** POST/PATCH/DELETE — renvoie l'enveloppe { success, message, ... } */
export async function apiSend<T = unknown>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown
): Promise<ApiResult<T>> {
  return apiRequest<T>(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** GET pour les fetchers SWR — renvoie `data` ou lève une erreur */
export async function apiGet<T = unknown>(path: string): Promise<T> {
  const result = await apiRequest<T>(path, { method: 'GET' });
  if (!result.success) {
    throw new Error(result.error ?? result.message ?? 'Erreur lors du chargement.');
  }
  return result.data as T;
}
