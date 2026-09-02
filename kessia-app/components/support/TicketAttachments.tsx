'use client';
// ============================================================
// KESSIA — Pièces jointes d'un ticket (§46)
// Utilisé côté demandeur (/support) et côté agent (/admin/support).
// ============================================================

import { useRef, useState } from 'react';
import { useTicketAttachments } from '@/hooks/useSupport';
import { prepareAttachment, formatBytes } from '@/lib/files/attachment-file';
import { useT } from '@/lib/i18n';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf';

function icon(mime: string): string {
  return mime === 'application/pdf' ? '📄' : '🖼️';
}

export function TicketAttachments({
  ticketId,
  canUpload,
  allowInternal = false,
  compact = false,
}: {
  ticketId: string;
  canUpload: boolean;
  allowInternal?: boolean;
  compact?: boolean;
}) {
  const t = useT();
  const { attachments, isLoading, upload, remove } = useTicketAttachments(ticketId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [asInternal, setAsInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const prepared = await prepareAttachment(file);
      const res = await upload({ ...prepared, isInternal: allowInternal ? asInternal : undefined });
      if (!res.success) setError(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('support.attachments.invalidFile'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
      {!compact && <strong style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{t('support.attachments.title')}</strong>}

      {isLoading && <span style={{ color: 'var(--color-text-tertiary)' }}>{t('support.attachments.loading')}</span>}
      {!isLoading && attachments.length === 0 && (
        <span style={{ color: 'var(--color-text-tertiary)' }}>{t('support.attachments.none')}</span>
      )}

      {attachments.map((a) => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {a.thumbnail && a.url ? (
            <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ flex: 'none' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.thumbnail}
                alt={a.fileName}
                loading="lazy"
                width={40}
                height={40}
                style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-border)', display: 'block' }}
              />
            </a>
          ) : (
            <span aria-hidden>{icon(a.mimeType)}</span>
          )}
          {a.url ? (
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-primary" style={{ fontWeight: 600 }}>
              {a.fileName}
            </a>
          ) : (
            <span>{a.fileName}</span>
          )}
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
            {formatBytes(a.size)}{a.isInternal ? ` · 🔒 ${t('support.attachments.internalTag')}` : ''}
          </span>
          {(a.uploadedByMe || allowInternal) && (
            <button
              type="button"
              onClick={() => remove(a.id)}
              style={{ marginLeft: 'auto', background: 'none', border: 0, cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 12 }}
              aria-label={t('support.attachments.removeAria', { name: a.fileName })}
            >
              {t('support.attachments.remove')}
            </button>
          )}
        </div>
      ))}

      {canUpload && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <input ref={inputRef} type="file" accept={ACCEPT} onChange={onPick} hidden />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? t('support.attachments.sending') : t('support.attachments.attach')}
          </button>
          {allowInternal && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={asInternal} onChange={(e) => setAsInternal(e.target.checked)} />
              {t('support.attachments.internal')}
            </label>
          )}
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{t('support.attachments.hint')}</span>
        </div>
      )}

      {error && <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>⚠️ {error}</span>}
    </div>
  );
}
