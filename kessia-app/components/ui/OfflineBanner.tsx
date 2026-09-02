'use client';
// ============================================================
// KESSIA — Bandeau « hors ligne » (§35, §51)
// Signal visuel persistant quand le navigateur perd la connexion.
// Les données déjà affichées restent lisibles ; SWR revalide au
// retour en ligne.
// ============================================================

import { useOnline } from '@/hooks/useOnline';
import { useT } from '@/lib/i18n';

export function OfflineBanner() {
  const online = useOnline();
  const t = useT();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '7px 14px',
        fontSize: 12.5,
        fontWeight: 600,
        color: '#fff',
        background: 'var(--color-warning, #96650F)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      }}
    >
      <span aria-hidden>⚠️</span>
      <span>{t('common.offlineBanner')}</span>
    </div>
  );
}
