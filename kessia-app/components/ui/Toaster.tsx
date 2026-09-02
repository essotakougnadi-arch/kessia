'use client';
// ============================================================
// KESSIA — Toaster
// Rend les toasts empilés dans le uiStore (voir store/uiStore.ts)
// ============================================================

import { useUiStore } from '@/store/uiStore';
import styles from './Toaster.module.css';

const ICONS: Record<string, string> = {
  success: '✅',
  error: '⚠️',
  info: 'ℹ️',
  warning: '🔔',
};

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const removeToast = useUiStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container} role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${styles[toast.type]}`}
          role={toast.type === 'error' ? 'alert' : 'status'}
        >
          <span className={styles.icon} aria-hidden>
            {ICONS[toast.type] ?? 'ℹ️'}
          </span>
          <p className={styles.message}>{toast.message}</p>
          <button
            type="button"
            className={styles.close}
            onClick={() => removeToast(toast.id)}
            aria-label="Fermer la notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
