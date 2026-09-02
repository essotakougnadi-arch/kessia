// ============================================================
// KESSIA — UI Store (Zustand)
// Toast notifications, modals, état global UI
// ============================================================

'use client';

import { create } from 'zustand';

export type Toast = {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
};

type UiState = {
  // Toasts
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;

  // Mobile sidebar / menu
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Balance visibility (wallet)
  isBalanceVisible: boolean;
  toggleBalance: () => void;
};

let toastCounter = 0;

export const useUiStore = create<UiState>((set) => ({
  // Toasts
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++toastCounter}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    // Auto-remove après duration (défaut 4s)
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, toast.duration ?? 4000);
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  // Sidebar
  isSidebarOpen: false,
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  toggleSidebar: () =>
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  // Balance
  isBalanceVisible: true,
  toggleBalance: () =>
    set((state) => ({ isBalanceVisible: !state.isBalanceVisible })),
}));
