'use client';
// ============================================================
// KESSIA — Thème (clair / sombre / système) — Design System §24
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeChoice = 'system' | 'light' | 'dark';

type ThemeState = {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
};

function apply(theme: ThemeChoice) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => {
        apply(theme);
        set({ theme });
      },
    }),
    {
      name: 'kessia-theme',
      onRehydrateStorage: () => (state) => apply(state?.theme ?? 'system'),
    }
  )
);

// Script inline (exécuté avant le paint) pour éviter le flash.
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('kessia-theme');if(s){var t=JSON.parse(s).state.theme;if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
