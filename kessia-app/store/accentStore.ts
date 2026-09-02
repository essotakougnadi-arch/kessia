'use client';
// ============================================================
// KESSIA — Couleur d'accent (Design System §36)
//
// Deux teintes signature au choix de l'utilisateur :
//   · terracotta — #B65A3A (défaut actuel)
//   · brique      — #C84B1E (la teinte d'origine de KESSIA)
//
// Appliqué via l'attribut `data-accent` sur <html> ; « terracotta »
// = pas d'attribut (valeurs par défaut de globals.css).
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AccentChoice = 'terracotta' | 'brique';

export const ACCENT_CHOICES: AccentChoice[] = ['terracotta', 'brique'];

type AccentState = {
  accent: AccentChoice;
  setAccent: (a: AccentChoice) => void;
};

function apply(accent: AccentChoice) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (accent === 'brique') root.setAttribute('data-accent', 'brique');
  else root.removeAttribute('data-accent');
}

export const useAccentStore = create<AccentState>()(
  persist(
    (set) => ({
      accent: 'terracotta',
      setAccent: (accent) => {
        apply(accent);
        set({ accent });
      },
    }),
    {
      name: 'kessia-accent',
      onRehydrateStorage: () => (state) => apply(state?.accent ?? 'terracotta'),
    }
  )
);

// Script inline (exécuté avant le paint) pour éviter le flash de couleur.
export const ACCENT_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('kessia-accent');if(s){var a=JSON.parse(s).state.accent;if(a==='brique')document.documentElement.setAttribute('data-accent','brique');}}catch(e){}})();`;
