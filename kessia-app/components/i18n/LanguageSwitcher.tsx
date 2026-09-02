'use client';
// ============================================================
// KESSIA — Sélecteur de langue compact (§38)
// Utilisable hors connexion (pages d'authentification) : ne
// persiste que le choix local (localStorage via useLocaleStore).
// ============================================================

import { useLocaleStore } from '@/lib/i18n';
import { LOCALES, LOCALE_META, isLocale } from '@/lib/i18n/config';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocaleStore();

  return (
    <label
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'var(--color-text-tertiary)',
      }}
    >
      <span aria-hidden>🌐</span>
      <span className="sr-only">Langue</span>
      <select
        value={locale}
        onChange={(e) => { if (isLocale(e.target.value)) setLocale(e.target.value); }}
        style={{
          appearance: 'auto',
          background: 'transparent',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '4px 8px',
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_META[l].native}{LOCALE_META[l].ready ? '' : ' ·'}
          </option>
        ))}
      </select>
    </label>
  );
}
