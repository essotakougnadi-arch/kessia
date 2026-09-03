// ============================================================
// KESSIA — useAuth Hook
// Logique d'authentification : register, login, logout, OTP
// ============================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';

// ── API helper ──────────────────────────────────────────────

async function apiFetch<T = unknown>(
  endpoint: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; message?: string; errors?: unknown }> {
  const res = await fetch(`/api/v1/${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  return json;
}

/** Mode démo : le serveur renvoie l'OTP, on le passe à la page de vérification. */
function stashDemoOtp(data: unknown) {
  const otp = (data as { demoOtp?: unknown } | null)?.demoOtp;
  try {
    if (typeof otp === 'string' && /^\d{4,8}$/.test(otp)) {
      sessionStorage.setItem('kessia-otp-demo', otp);
    } else {
      sessionStorage.removeItem('kessia-otp-demo');
    }
  } catch {
    /* sessionStorage indisponible — sans effet */
  }
}

// ── Types ────────────────────────────────────────────────────

export type RegisterPayload = {
  phone: string;
  firstName: string;
  lastName: string;
  password: string;
  email?: string;
  userType?: string;
  consentTerms: boolean;
  consentData: boolean;
  termsVersion?: string;
};

export type LoginPayload = {
  phone: string;
  password: string;
};

export type OtpPayload = {
  phone: string;
  code: string;
  purpose: 'REGISTER' | 'LOGIN' | 'VERIFY';
};

// ── Hook ─────────────────────────────────────────────────────

type SessionData = {
  user: { id: string; phone: string; firstName: string; lastName: string; role: string; kycStatus: string; kycLevel: number };
  accessToken: string;
  refreshToken: string;
};
type LoginResponse = SessionData | { requires2fa: true; challengeToken: string };

export function useAuth() {
  const router = useRouter();
  const { login, logout: storeLogout, user, isAuthenticated, accessToken } = useAuthStore();
  const { addToast } = useUiStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  function finishSession(data: SessionData) {
    login({ ...data.user, isPhoneVerified: true }, data.accessToken, data.refreshToken);
    setChallengeToken(null);
    addToast({ type: 'success', message: `Bienvenue, ${data.user.firstName} !` });
    router.push('/home');
  }

  // ──── REGISTER ────

  async function register(payload: RegisterPayload) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ userId: string; phone: string; otpSent: boolean; demoOtp?: string }>(
        'auth/register',
        { method: 'POST', body: JSON.stringify(payload) }
      );

      if (!res.success) {
        const msg = res.message ?? 'Erreur lors de l\'inscription.';
        setError(msg);
        addToast({ type: 'error', message: msg });
        return null;
      }

      stashDemoOtp(res.data);

      addToast({
        type: 'success',
        message: `Code OTP envoyé au ${payload.phone}. Vérifiez vos SMS.`,
        duration: 6000,
      });

      return res.data;
    } catch {
      const msg = 'Erreur de connexion. Vérifiez votre réseau.';
      setError(msg);
      addToast({ type: 'error', message: msg });
      return null;
    } finally {
      setLoading(false);
    }
  }

  // ──── LOGIN (par mot de passe) ────

  async function loginWithPassword(payload: LoginPayload): Promise<'ok' | '2fa' | 'error'> {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<LoginResponse>('auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.success) {
        const msg = res.message ?? 'Identifiants incorrects.';
        setError(msg);
        addToast({ type: 'error', message: msg });
        return 'error';
      }

      if (res.data && 'requires2fa' in res.data) {
        setChallengeToken(res.data.challengeToken);
        return '2fa';
      }
      if (res.data) {
        finishSession(res.data);
      }
      return 'ok';
    } catch {
      const msg = 'Erreur de connexion. Vérifiez votre réseau.';
      setError(msg);
      addToast({ type: 'error', message: msg });
      return 'error';
    } finally {
      setLoading(false);
    }
  }

  async function verify2fa(code: string): Promise<boolean> {
    if (!challengeToken) return false;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<SessionData>('auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeToken, code }),
      });
      if (!res.success || !res.data) {
        const msg = res.message ?? 'Code incorrect.';
        setError(msg);
        addToast({ type: 'error', message: msg });
        return false;
      }
      finishSession(res.data);
      return true;
    } catch {
      setError('Erreur réseau.');
      return false;
    } finally {
      setLoading(false);
    }
  }

  // ──── VERIFY OTP ────

  async function verifyOtp(payload: OtpPayload): Promise<'ok' | '2fa' | 'error'> {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<LoginResponse>('auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.success) {
        const msg = res.message ?? 'Code OTP invalide.';
        setError(msg);
        addToast({ type: 'error', message: msg });
        return 'error';
      }

      try { sessionStorage.removeItem('kessia-otp-demo'); } catch { /* noop */ }

      if (res.data && 'requires2fa' in res.data) {
        setChallengeToken(res.data.challengeToken);
        return '2fa';
      }
      if (res.data) {
        finishSession(res.data);
      }
      return 'ok';
    } catch {
      const msg = 'Erreur de connexion. Vérifiez votre réseau.';
      setError(msg);
      addToast({ type: 'error', message: msg });
      return 'error';
    } finally {
      setLoading(false);
    }
  }

  // ──── REQUEST OTP ────

  async function requestOtp(phone: string, purpose: 'REGISTER' | 'LOGIN' | 'VERIFY') {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ demoOtp?: string }>('auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ phone, purpose }),
      });

      if (!res.success) {
        const msg = res.message ?? 'Erreur lors de l\'envoi du code OTP.';
        setError(msg);
        addToast({ type: 'error', message: msg });
        return false;
      }

      stashDemoOtp(res.data);
      addToast({ type: 'success', message: 'Code OTP envoyé par SMS.' });
      return true;
    } catch {
      setError('Erreur réseau.');
      return false;
    } finally {
      setLoading(false);
    }
  }

  // ──── LOGOUT ────

  async function logout() {
    setLoading(true);
    try {
      if (accessToken) {
        await apiFetch('auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
    } catch {
      // Ignore — logout local quoi qu'il arrive
    } finally {
      storeLogout();
      router.push('/login');
      setLoading(false);
    }
  }

  return {
    user,
    isAuthenticated,
    loading,
    error,
    pending2fa: challengeToken != null,
    register,
    loginWithPassword,
    verifyOtp,
    verify2fa,
    requestOtp,
    logout,
  };
}
