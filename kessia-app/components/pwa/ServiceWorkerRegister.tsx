'use client';

import { useEffect } from 'react';

// Enregistre le service worker (installabilité + repli hors ligne, §5/§35).
// Silencieux : un échec n'affecte pas l'application.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* pas de SW — l'app fonctionne normalement */
      });
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
