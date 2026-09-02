'use client';
// ============================================================
// KESSIA — Mur de ré-acceptation des documents juridiques (§8)
//
// Monté dans le layout du tableau de bord. Si la version des CGU
// acceptée par l'utilisateur n'est plus la version courante
// (`lib/legal/versions.ts`), affiche un panneau bloquant tant
// que la nouvelle version n'a pas été acceptée.
// ============================================================

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend } from '@/lib/api/client';

type Acceptance = {
  upToDate: boolean;
  currentVersionLabel: string;
  documents: { path: string; title: string }[];
};

export function LegalGate() {
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);

  const { data, mutate } = useSWR<Acceptance>(
    token ? ['/api/v1/legal/acceptance', token] : null,
    ([u]: [string, string]) => apiGet<Acceptance>(u),
    { revalidateOnFocus: false }
  );

  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rien tant qu'on ne sait pas, ou si l'utilisateur est à jour.
  if (!token || !data || data.upToDate) return null;

  async function accept() {
    setSaving(true);
    setError(null);
    const res = await apiSend('/api/v1/legal/acceptance', 'POST');
    setSaving(false);
    if (res.success) {
      await mutate();
    } else {
      setError(res.error ?? res.message ?? "Impossible d'enregistrer votre acceptation.");
    }
  }

  function signOut() {
    logout();
    router.push('/login');
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-gate-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'grid', placeItems: 'center', padding: 16,
        background: 'rgba(26, 18, 9, 0.55)', backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 460,
          background: 'var(--color-surface)', color: 'var(--color-text)',
          border: '1px solid var(--color-border)', borderRadius: 16,
          padding: 24, boxShadow: 'var(--shadow-xl)',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <h2 id="legal-gate-title" style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
          Nos conditions ont évolué
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
          Une nouvelle version de nos documents juridiques est entrée en vigueur
          (version {data.currentVersionLabel}). Merci de la lire et de l’accepter
          pour continuer à utiliser KESSIA.
        </p>

        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.documents.map((doc) => (
            <li key={doc.path}>
              <a
                href={doc.path}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary"
                style={{ fontSize: 13, fontWeight: 600 }}
              >
                {doc.title} ↗
              </a>
            </li>
          ))}
        </ul>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>J’ai lu et j’accepte la nouvelle version des conditions d’utilisation et de la politique de confidentialité.</span>
        </label>

        {error && (
          <p style={{ fontSize: 12.5, color: 'var(--color-danger)', margin: 0 }}>⚠️ {error}</p>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 2 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!checked || saving}
            onClick={accept}
            style={{ flex: 1 }}
          >
            {saving ? 'Enregistrement…' : 'Continuer'}
          </button>
          <button
            type="button"
            onClick={signOut}
            style={{
              background: 'none', border: 0, cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-tertiary)',
            }}
          >
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
