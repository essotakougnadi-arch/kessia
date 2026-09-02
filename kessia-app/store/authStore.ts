// ============================================================
// KESSIA — Auth Store (Zustand)
// Gestion de l'état d'authentification global
// ============================================================

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ── Cookie sync ─────────────────────────────────────────────
// Le middleware Next.js (middleware.ts) protège les routes en
// lisant le cookie `kessia-access-token`. Le store est la source
// de vérité côté client ; on réplique le token dans un cookie
// lisible pour que le middleware puisse gater les routes.
const AUTH_COOKIE = 'kessia-access-token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 jours (durée du refresh token)

function syncAuthCookie(token: string | null) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (token) {
    document.cookie = `${AUTH_COOKIE}=${token}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } else {
    document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
  }
}

export type KessiaUser = {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  role: string;
  kycStatus: string;
  kycLevel: number;
  isPhoneVerified: boolean;
  avatar?: string | null;
};

type AuthState = {
  // État
  user: KessiaUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setUser: (user: KessiaUser) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setLoading: (loading: boolean) => void;
  login: (user: KessiaUser, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  updateUser: (partial: Partial<KessiaUser>) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // État initial
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      // Définir l'utilisateur
      setUser: (user) => set({ user }),

      // Définir les tokens
      setTokens: (accessToken, refreshToken) => {
        syncAuthCookie(accessToken);
        set({ accessToken, refreshToken });
      },

      // Définir le chargement
      setLoading: (isLoading) => set({ isLoading }),

      // Connexion complète
      login: (user, accessToken, refreshToken) => {
        syncAuthCookie(accessToken);
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      // Déconnexion
      logout: () => {
        syncAuthCookie(null);
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      // Mise à jour partielle du profil
      updateUser: (partial) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),
    }),
    {
      name: 'kessia-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
      // Ne persister que les tokens et les infos user essentielles
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      // Au rechargement : re-synchroniser le cookie depuis l'état persisté
      onRehydrateStorage: () => (state) => {
        syncAuthCookie(state?.accessToken ?? null);
      },
    }
  )
);
