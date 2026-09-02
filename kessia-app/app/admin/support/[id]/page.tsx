'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from '../../admin.module.css';
import { ticketPill } from '../../pills';
import { useAdminTicket } from '@/hooks/useAdmin';
import { TicketAttachments } from '@/components/support/TicketAttachments';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { formatDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';
import type { TicketStatus } from '@prisma/client';

const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'];

export default function AdminTicketPage({ params }: { params: { id: string } }) {
  const t = useT();
  const meId = useAuthStore((s) => s.user?.id);
  const addToast = useUiStore((s) => s.addToast);
  const { ticket, isLoading, error, assignToMe, unassign, setStatus, reply } = useAdminTicket(params.id);

  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ success: boolean; message: string }>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    return r;
  }

  async function send() {
    if (text.trim().length === 0) return;
    const r = await run(() => reply(text.trim(), internal));
    if (r.success) setText('');
  }

  return (
    <div className={styles.wrap}>
      <Link href="/admin/support" className={styles.back}>{t('admin.support.back')}</Link>

      {isLoading && <div className={styles.empty}>{t('admin.support.loading')}</div>}
      {error && !isLoading && <div className={styles.err}>{t('admin.support.notFound')}</div>}

      {ticket && (
        <>
          <h1 className={styles.h1}>{ticket.subject}</h1>
          <p className={styles.lede}>
            <span className={styles.mono}>{ticket.ticketNumber}</span> · {ticket.category} · {ticketPill(t, ticket.status)}
            {' · '}
            {t('admin.support.by', {
              name: `${ticket.user.firstName} ${ticket.user.lastName}`,
              phone: ticket.user.phone,
            })}
          </p>

          <div className={styles.reviewGrid}>
            {/* Fil de discussion */}
            <div>
              <div className={styles.panel} style={{ marginBottom: 12 }}>
                <h3>{t('admin.support.initialRequest')}</h3>
                <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0 }}>{ticket.description}</p>
              </div>

              {ticket.messages.map((m) => {
                const fromCustomer = m.authorId === ticket.user.id;
                return (
                  <div
                    key={m.id}
                    className={styles.panel}
                    style={{
                      marginBottom: 10,
                      borderLeft: `3px solid ${m.isInternal ? 'var(--color-warning)' : fromCustomer ? 'var(--color-border-medium)' : 'var(--color-primary)'}`,
                    }}
                  >
                    <div className={styles.muted} style={{ marginBottom: 4 }}>
                      {m.isInternal ? t('admin.support.internalNote') : fromCustomer ? t('admin.support.customer') : t('admin.support.agent')}
                      {m.authorId === meId ? t('admin.support.you') : ''} · {formatDate(m.createdAt)}
                    </div>
                    <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0 }}>{m.content}</p>
                  </div>
                );
              })}

              <div className={styles.panel} style={{ marginBottom: 10 }}>
                <h3>{t('admin.support.attachments')}</h3>
                <TicketAttachments
                  ticketId={params.id}
                  canUpload={ticket.status !== 'CLOSED'}
                  allowInternal
                  compact
                />
              </div>

              {ticket.status !== 'CLOSED' ? (
                <div className={styles.panel}>
                  <h3>{t('admin.support.reply')}</h3>
                  <textarea
                    className={styles.textarea}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={internal ? t('admin.support.internalPlaceholder') : t('admin.support.publicPlaceholder')}
                  />
                  <label className={styles.field} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                    {t('admin.support.internalCheckbox')}
                  </label>
                  <button className="btn btn-primary btn-full" style={{ marginTop: 10 }} disabled={busy || !text.trim()} onClick={send}>
                    {busy ? '…' : internal ? t('admin.support.addNote') : t('admin.support.sendReply')}
                  </button>
                </div>
              ) : (
                <div className={styles.panel}><span className={styles.muted}>{t('admin.support.closedNote')}</span></div>
              )}
            </div>

            {/* Actions */}
            <div className={styles.panel}>
              <h3>{t('admin.support.handling')}</h3>

              <div className={styles.field}>
                <b>{t('admin.support.assignedTo')}</b><br />
                {ticket.assignedTo
                  ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}${ticket.assignedTo.id === meId ? t('admin.support.you') : ''}`
                  : t('admin.support.nobody')}
              </div>
              <div className={styles.reviewActions}>
                {ticket.assignedTo?.id !== meId && (
                  <button className="btn btn-full" disabled={busy} onClick={() => run(assignToMe)}>{t('admin.support.assignToMe')}</button>
                )}
                {ticket.assignedTo && (
                  <button className="btn btn-ghost btn-full" disabled={busy} onClick={() => run(unassign)}>{t('admin.support.unassign')}</button>
                )}
              </div>

              <label className={styles.field} htmlFor="st" style={{ marginTop: 14 }}><b>{t('admin.support.statusLabel')}</b></label>
              <select
                id="st"
                className={styles.textarea}
                style={{ minHeight: 0, padding: '8px 12px' }}
                value={ticket.status}
                disabled={busy}
                onChange={(e) => run(() => setStatus(e.target.value as TicketStatus))}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{t(`admin.pill.ticket.${s}`)}</option>)}
              </select>
              <p className={styles.muted} style={{ marginTop: 8 }}>
                {t('admin.support.notifyNote')}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
