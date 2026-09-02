// ============================================================
// KESSIA — Brouillons de formulaire (cahier des charges §35)
//
// Sauvegarde locale d'un formulaire en cours de saisie pour ne
// pas le perdre sur une connexion instable ou une fermeture
// accidentelle. Purement local (localStorage), par utilisateur /
// navigateur. Effacé à la soumission réussie.
// ============================================================

'use client';

import { useCallback, useRef, useState } from 'react';

const PREFIX = 'kessia:draft:';

type Stored<T> = { v: T; at: number };

function read<T>(key: string): Stored<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (!parsed || typeof parsed.at !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Vrai si l'objet ne contient que des valeurs « vides » (chaîne vide, 0, null, []). */
function isEmpty(v: unknown): boolean {
  if (v == null || v === '' || v === 0) return true;
  if (Array.isArray(v)) return v.every(isEmpty);
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).every(isEmpty);
  return false;
}

export function useFormDraft<T extends object>(key: string) {
  // Lecture unique à l'initialisation — sert à pré-remplir le formulaire.
  const initial = useRef<Stored<T> | null>(read<T>(key));
  const [dismissed, setDismissed] = useState(false);

  const save = useCallback((values: T) => {
    try {
      if (isEmpty(values)) {
        localStorage.removeItem(PREFIX + key);
        return;
      }
      localStorage.setItem(PREFIX + key, JSON.stringify({ v: values, at: Date.now() } satisfies Stored<T>));
    } catch {
      /* stockage indisponible → on continue sans brouillon */
    }
  }, [key]);

  const clear = useCallback(() => {
    try { localStorage.removeItem(PREFIX + key); } catch { /* noop */ }
  }, [key]);

  const dismiss = useCallback(() => {
    clear();
    setDismissed(true);
  }, [clear]);

  return {
    /** valeurs du brouillon retrouvé au montage (null si aucun) */
    draft: initial.current?.v ?? null,
    /** horodatage du brouillon retrouvé */
    draftAt: initial.current?.at ?? null,
    /** un brouillon a été retrouvé et n'a pas encore été ignoré */
    hasDraft: !!initial.current && !dismissed,
    save,
    clear,
    dismiss,
  };
}
