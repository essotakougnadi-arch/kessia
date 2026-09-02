'use client';
// ============================================================
// KESSIA — Modal générique (dialog + overlay)
// ============================================================

import { useEffect, useRef } from 'react';
import styles from './Modal.module.css';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Empêche la fermeture (ex. pendant une soumission) */
  locked?: boolean;
};

export function Modal({ open, onClose, title, children, locked = false }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !locked) onClose();
    }
    document.addEventListener('keydown', onKey);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, locked, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={locked}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
