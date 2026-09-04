'use client';
// ============================================================
// KESSIA — Verrou PIN de déverrouillage rapide (ADR 0041, item 1)
//
// Monté dans le layout du tableau de bord, à côté de LegalGate. Si
// l'utilisateur a activé un code PIN (/profile/security), affiche un
// panneau bloquant tant que le PIN n'a pas été saisi correctement
// pour CETTE fenêtre/onglet (sessionStorage — se réactive à chaque
// nouvelle ouverture de l'app, comme sur un téléphone). Ne remplace
// JAMAIS l'authentification : la session (jetons) reste celle déjà
// émise par /auth/login ; ce panneau ne fait qu'appeler
// /auth/pin/verify, qui ne délivre aucun jeton.
// ============================================================

import { useEffect, useState, FormEvent } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend } from '@/lib/api/client';
import { useT } from '@/lib/i18n';

const SESSION_KEY = 'kessia-pin-unlocked';

export function PinLockGate() {
  const t = useT();
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);

  const { data } = useSWR<{ enabled: boolean }>(
    token ? ['/api/v1/auth/pin', token] : null,
    ([u]: [string, string]) => apiGet(u),
    { revalidateOnFocus: false }
  );

  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data?.enabled) { setLocked(false); return; }
    try {
      setLocked(sessionStorage.getItem(SESSION_KEY) !== '1');
    } catch {
      setLocked(false); // pas de sessionStorage (mode privé strict) → ne bloque pas
    }
  }, [data?.enabled]);

  if (!token || !locked) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await apiSend('/api/v1/auth/pin/verify', 'POST', { pin });
    setBusy(false);
    if (res.success) {
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
      setLocked(false);
    } else {
      setError(res.error ?? res.message ?? t('pinLock.wrong'));
      setPin('');
    }
  }

  function signOut() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    logout();
    router.push('/login');
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-lock-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'grid', placeItems: 'center', padding: 16,
        background: 'var(--color-background)',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%', maxWidth: 340,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}
      >
        <span style={{ fontSize: 40 }} aria-hidden>🔒</span>
        <h2 id="pin-lock-title" style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
          {t('pinLock.title')}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center', margin: 0 }}>
          {t('pinLock.subtitle')}
        </p>
        <input
          className="input"
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          style={{ textAlign: 'center', fontSize: 24, letterSpacing: 10, maxWidth: 200 }}
          id="pin-lock-input"
        />
        {error && <p style={{ fontSize: 12.5, color: 'var(--color-danger)', margin: 0 }}>⚠️ {error}</p>}
        <button type="submit" className="btn btn-primary btn-full" disabled={busy || pin.length < 4} id="btn-pin-unlock">
          {busy ? t('securityPage.busy') : t('pinLock.unlock')}
        </button>
        <button
          type="button"
          onClick={signOut}
          style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-tertiary)' }}
        >
          {t('pinLock.signOut')}
        </button>
      </form>
    </div>
  );
}
