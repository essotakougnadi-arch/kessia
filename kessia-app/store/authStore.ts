// ============================================================
// KESSIA — Auth Store (Zustand)
// Gestion de l'état d'authentification global
// ============================================================

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// P0.2 : les tokens ne sont plus jamais persistés (localStorage) ni posés
// en cookie par le JavaScript client. Le serveur pose désormais des
// cookies HttpOnly (`lib/auth/cookies.ts`) — illisibles/inscriptibles en
// JS, la vraie mitigation XSS. `accessToken` reste en mémoire (le temps de
// l'onglet, pour l'en-tête `Authorization: Bearer` de `apiClient`) mais
// n'est plus écrit sur disque ; il est régénéré au chargement via
// `AuthBootstrap` (POST /api/v1/auth/refresh, cookie HttpOnly envoyé
// automatiquement par le navigateur). Le refresh token, le plus sensible
// (30 j), ne transite plus jamais par le JS du navigateur.

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
  accessToken: string | null; // en mémoire uniquement — jamais persisté
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setUser: (user: KessiaUser) => void;
  setAccessToken: (accessToken: string) => void;
  setLoading: (loading: boolean) => void;
  login: (user: KessiaUser, accessToken: string) => void;
  logout: () => void;
  updateUser: (partial: Partial<KessiaUser>) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // État initial
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      // Définir l'utilisateur
      setUser: (user) => set({ user }),

      // Définir le token d'accès (en mémoire)
      setAccessToken: (accessToken) => set({ accessToken }),

      // Définir le chargement
      setLoading: (isLoading) => set({ isLoading }),

      // Connexion complète
      login: (user, accessToken) => {
        set({
          user,
          accessToken,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      // Déconnexion
      logout: () => {
        set({
          user: null,
          accessToken: null,
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
      // Ne persister QUE l'identité — jamais de token (P0.2). `isAuthenticated`
      // persisté sert de repère UX immédiat au chargement ; la vraie
      // authentification est re-vérifiée par `AuthBootstrap` (refresh).
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
