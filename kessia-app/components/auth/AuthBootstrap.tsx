'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';

// P0.2 : `accessToken` n'est plus persisté (localStorage) — seuls `user` et
// `isAuthenticated` le sont. Au chargement d'un onglet, si l'état persisté
// indique une session, ce composant échange le cookie HttpOnly
// `kessia-refresh-token` (envoyé automatiquement par le navigateur) contre
// un `accessToken` frais en mémoire, via POST /api/v1/auth/refresh. Si
// l'échange échoue (cookie absent/expiré/révoqué), la session locale est
// nettoyée — évite un état « isAuthenticated=true » fantôme sans token
// utilisable.
export function AuthBootstrap() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const attempted = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || accessToken || attempted.current) return;
    attempted.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/refresh', { method: 'POST' });
        const json = await res.json().catch(() => null);
        if (cancelled) return;

        if (res.ok && json?.success && json.data?.accessToken) {
          useAuthStore.getState().setAccessToken(json.data.accessToken);
          if (json.data.user) useAuthStore.getState().updateUser(json.data.user);
        } else {
          useAuthStore.getState().logout();
        }
      } catch {
        if (!cancelled) useAuthStore.getState().logout();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, accessToken]);

  return null;
}
