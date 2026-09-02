// ============================================================
// KESSIA — useOnline (§35, §51)
// État de connectivité du navigateur. SWR revalide déjà au retour
// en ligne ; ce hook fournit le signal visuel manquant.
// ============================================================

'use client';

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

// `navigator.onLine` : false = certainement hors ligne ; true = peut-être
// en ligne (pas de garantie de joignabilité serveur). On s'en sert
// uniquement pour ne PAS afficher un message trompeur.
const getSnapshot = (): boolean => navigator.onLine;

// Côté serveur : on suppose en ligne (le bandeau ne rend rien).
const getServerSnapshot = (): boolean => true;

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
