'use client';
// ============================================================
// KESSIA — Bandeau « brouillon restauré » (§35)
// ============================================================

function ago(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function DraftNotice({ at, onDismiss }: { at: number; onDismiss: () => void }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
        background: 'var(--color-primary-light)', color: 'var(--color-text-secondary)',
        borderRadius: 10, padding: '8px 10px',
      }}
    >
      <span aria-hidden>✎</span>
      <span style={{ flex: 1 }}>Brouillon restauré ({ago(at)}).</span>
      <button
        type="button"
        onClick={onDismiss}
        style={{ background: 'none', border: 0, color: 'var(--color-primary)', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
      >
        Repartir de zéro
      </button>
    </div>
  );
}
