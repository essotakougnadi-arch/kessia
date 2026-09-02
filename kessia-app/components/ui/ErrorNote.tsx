'use client';
// ============================================================
// KESSIA — ErrorNote
// Bandeau d'erreur inline avec option « Réessayer ». Devient
// explicitement « hors ligne » quand la connexion est perdue (§51).
// ============================================================

import styles from './ErrorNote.module.css';
import { useOnline } from '@/hooks/useOnline';
import { useT } from '@/lib/i18n';

type ErrorNoteProps = {
  message?: string;
  onRetry?: () => void;
};

export function ErrorNote({ message, onRetry }: ErrorNoteProps) {
  const online = useOnline();
  const t = useT();

  const text = !online
    ? t('common.offlineNote')
    : message ?? t('common.loadError');

  return (
    <div className={styles.note} role="alert">
      <span className={styles.icon} aria-hidden>{online ? '⚠️' : '📡'}</span>
      <span className={styles.text}>{text}</span>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}
