import type { Metadata } from 'next';
import { OfflineRetry } from './offline-retry';

export const metadata: Metadata = {
  title: 'Hors ligne — KESSIA',
};

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '32px 24px',
        background: 'var(--color-background)',
        color: 'var(--color-text)',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 44 }} aria-hidden>📡</div>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Vous êtes hors ligne</h1>
      <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)', maxWidth: 340, lineHeight: 1.6 }}>
        Les pages consultées récemment restent accessibles hors ligne, mais les opérations
        (cotisation, transfert, paiement) nécessitent une connexion pour être confirmées
        par nos serveurs. La page se rechargera automatiquement au retour du réseau.
      </p>
      <OfflineRetry />
    </div>
  );
}
