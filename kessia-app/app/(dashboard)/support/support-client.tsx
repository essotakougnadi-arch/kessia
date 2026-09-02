'use client';
// ============================================================
// KESSIA — Support (Client Component)
// Tickets réels + création + fil de discussion
// ============================================================

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import styles from './support.module.css';
import { Modal } from '@/components/ui/Modal';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useSupport, useTicketThread, type SupportTicket } from '@/hooks/useSupport';
import { TicketAttachments } from '@/components/support/TicketAttachments';
import { useT } from '@/lib/i18n';
import { formatRelativeDate } from '@/lib/utils/format';
import type { TicketCategory, TicketStatus } from '@prisma/client';

const FAQ_ITEMS = [
  { id: '1', qKey: 'support.faqItems.q1', catKey: 'support.cat.WALLET', icon: '💰' },
  { id: '2', qKey: 'support.faqItems.q2', catKey: 'support.cat.WALLET', icon: '⏱️' },
  { id: '3', qKey: 'support.faqItems.q3', catKey: 'support.cat.KYC', icon: '🔐' },
  { id: '4', qKey: 'support.faqItems.q4', catKey: 'support.cat.TONTINE', icon: '🔄' },
  { id: '5', qKey: 'support.faqItems.q5', catKey: 'support.cat.PAYMENT', icon: '❌' },
];

const CONTACT_CHANNELS = [
  { icon: '💬', label: 'KESSIA AI', subKey: 'support.channelAiSub', sub: '', href: '/ai' },
  { icon: '📱', label: 'WhatsApp', subKey: '', sub: '+228 90 00 00 00', href: 'https://wa.me/22890000000' },
  { icon: '📧', label: 'Email', subKey: '', sub: 'support@kessia.app', href: 'mailto:support@kessia.app' },
];

const STATUS_COLOR: Record<TicketStatus, string> = {
  OPEN: 'info',
  IN_PROGRESS: 'warning',
  WAITING: 'gold',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

const CATEGORY_KEYS: TicketCategory[] = [
  'WALLET', 'TONTINE', 'BUSINESS', 'KYC', 'PAYMENT', 'ACCOUNT', 'SECURITY', 'OTHER',
];

export default function SupportClient() {
  const t = useT();
  const { tickets, isLoading, error, refresh, createTicket } = useSupport();
  const addToast = useUiStore((s) => s.addToast);

  const [showCreate, setShowCreate] = useState(false);
  const [openTicket, setOpenTicket] = useState<SupportTicket | null>(null);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('support.title')}</h1>
        <p className={styles.subtitle}>{t('support.subtitle')}</p>
      </div>

      {/* Contact */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('support.contactUs')}</h2>
        </div>
        <div className={styles.channelGrid}>
          {CONTACT_CHANNELS.map((ch) => (
            <Link key={ch.label} href={ch.href} className={styles.channelCard}>
              <div className={styles.channelIcon}>{ch.icon}</div>
              <div className={styles.channelLabel}>{ch.label}</div>
              <div className={styles.channelSub}>{ch.subKey ? t(ch.subKey) : ch.sub}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Nouveau ticket */}
      <div className={styles.section}>
        <button className={styles.newTicketBtn} id="btn-new-ticket" onClick={() => setShowCreate(true)}>
          <span className={styles.newTicketIcon}>✉️</span>
          <div className={styles.newTicketText}>
            <div className={styles.newTicketTitle}>{t('support.openTicket')}</div>
            <div className={styles.newTicketSub}>{t('support.openTicketSub')}</div>
          </div>
          <span className={styles.newTicketArrow}>→</span>
        </button>
      </div>

      {/* Mes tickets */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('support.myTickets')}</h2>
          {!isLoading && <span className={styles.ticketCount}>{tickets.length}</span>}
        </div>

        {error && !isLoading && (
          <ErrorNote message={t('support.loadError')} onRetry={refresh} />
        )}

        <div className={styles.ticketList}>
          {isLoading && (
            <div className={styles.ticketCard}>
              <div className={`${styles.ticketSubject} ${styles.skeleton}`}>{t('support.loadingTicket')}</div>
              <div className={`${styles.ticketPreview} ${styles.skeleton}`}>…</div>
            </div>
          )}

          {!isLoading && !error && tickets.length === 0 && (
            <div className={styles.emptyRow}>{t('support.noTickets')}</div>
          )}

          {!isLoading && tickets.map((tk) => {
            const last = tk.messages[0];
            return (
              <button
                key={tk.id}
                className={`${styles.ticketCard} ${styles.cardBtn}`}
                id={`ticket-${tk.id}`}
                onClick={() => setOpenTicket(tk)}
              >
                <div className={styles.ticketHeader}>
                  <div className={styles.ticketId}>{tk.ticketNumber}</div>
                  <div className={`${styles.ticketStatus} ${styles[`ticketStatus_${STATUS_COLOR[tk.status]}`]}`}>{t(`support.status.${tk.status}`)}</div>
                </div>
                <div className={styles.ticketSubject}>{tk.subject}</div>
                <div className={styles.ticketMeta}>
                  <span className={styles.ticketCategory}>{t(`support.cat.${tk.category}`)}</span>
                  <span className={styles.ticketDot}>·</span>
                  <span className={styles.ticketDate}>{formatRelativeDate(tk.createdAt)}</span>
                </div>
                <div className={styles.ticketPreview}>{last?.content ?? tk.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* FAQ */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('support.faq')}</h2>
        </div>
        <div className={styles.faqList}>
          {FAQ_ITEMS.map((faq) => (
            <Link key={faq.id} href={`/ai?q=${encodeURIComponent(t(faq.qKey))}`} className={styles.faqItem}>
              <div className={styles.faqLeft}>
                <span className={styles.faqIcon}>{faq.icon}</span>
                <div>
                  <div className={styles.faqQuestion}>{t(faq.qKey)}</div>
                  <div className={styles.faqCategory}>{t(faq.catKey)}</div>
                </div>
              </div>
              <span className={styles.faqArrow}>›</span>
            </Link>
          ))}
        </div>
      </div>

      {/* AI Help */}
      <div className={styles.aiHelpSection}>
        <Link href="/ai" className={styles.aiHelpCard} id="btn-ai-help">
          <div className={styles.aiHelpIcon}>✨</div>
          <div className={styles.aiHelpText}>
            <div className={styles.aiHelpTitle}>{t('support.tryAi')}</div>
            <div className={styles.aiHelpSub}>{t('support.tryAiSub')}</div>
          </div>
          <div className={styles.aiHelpArrow}>→</div>
        </Link>
      </div>

      {/* Modales */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('support.openTicket')}>
        <CreateTicketForm
          onSubmit={createTicket}
          onDone={(msg) => {
            addToast({ type: 'success', message: msg, duration: 6000 });
            setShowCreate(false);
          }}
        />
      </Modal>

      <Modal
        open={!!openTicket}
        onClose={() => setOpenTicket(null)}
        title={openTicket?.subject ?? t('support.ticketFallback')}
      >
        {openTicket && <TicketThread ticket={openTicket} />}
      </Modal>
    </div>
  );
}

// ── Formulaire création ─────────────────────────────────────

function CreateTicketForm({
  onSubmit,
  onDone,
}: {
  onSubmit: (p: { category: TicketCategory; subject: string; description: string }) => Promise<{ success: boolean; message: string }>;
  onDone: (message: string) => void;
}) {
  const t = useT();
  const [category, setCategory] = useState<TicketCategory>('WALLET');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (subject.trim().length < 5) return setError(t('support.subjectError'));
    if (description.trim().length < 10) return setError(t('support.descriptionError'));
    setLoading(true);
    const result = await onSubmit({ category, subject: subject.trim(), description: description.trim() });
    setLoading(false);
    if (result.success) onDone(result.message);
    else setError(result.message);
  }

  return (
    <form className={styles.modalForm} onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="label">{t('support.category')}</label>
        <div className={styles.segRow}>
          {CATEGORY_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`${styles.segBtn} ${category === k ? styles.segBtnActive : ''}`}
              onClick={() => setCategory(k)}
            >
              {t(`support.cat.${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="ticket-subject">{t('support.subject')}</label>
        <input
          id="ticket-subject"
          className="input"
          placeholder={t('support.subjectPlaceholder')}
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          autoFocus
        />
      </div>

      <div className="form-group">
        <label className="label" htmlFor="ticket-desc">{t('support.description')}</label>
        <textarea
          id="ticket-desc"
          className={`input ${styles.modalTextarea}`}
          placeholder={t('support.descriptionPlaceholder')}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {error && <div className={styles.modalError}>⚠️ {error}</div>}

      <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
        {loading ? t('support.sending') : t('support.createTicket')}
      </button>
    </form>
  );
}

// ── Fil de discussion ───────────────────────────────────────

function TicketThread({ ticket }: { ticket: SupportTicket }) {
  const t = useT();
  const userId = useAuthStore((s) => s.user?.id);
  const { messages, isLoading, reply } = useTicketThread(ticket.id);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const closed = ticket.status === 'CLOSED';

  async function handleReply(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    const result = await reply(draft.trim());
    setSending(false);
    if (result.success) setDraft('');
  }

  return (
    <div>
      <div className={styles.ticketMeta} style={{ marginBottom: 10 }}>
        <span className={styles.ticketCategory}>{t(`support.cat.${ticket.category}`)}</span>
        <span className={styles.ticketDot}>·</span>
        <span>{ticket.ticketNumber}</span>
        <span className={styles.ticketDot}>·</span>
        <span>{t(`support.status.${ticket.status}`)}</span>
      </div>

      <div className={styles.thread}>
        {isLoading && <div className={styles.emptyRow}>{t('support.loading')}</div>}
        {!isLoading && messages.length === 0 && (
          <div className={styles.emptyRow}>{t('support.noMessages')}</div>
        )}
        {messages.map((m) => {
          const mine = m.authorId === userId;
          return (
            <div key={m.id} className={`${styles.threadMsg} ${mine ? styles.threadMine : styles.threadOther}`}>
              {m.content}
              <span className={styles.threadTime}>{formatRelativeDate(m.createdAt)}</span>
            </div>
          );
        })}
      </div>

      {closed ? (
        <p className={styles.emptyRow}>{t('support.closed')}</p>
      ) : (
        <form className={styles.replyRow} onSubmit={handleReply}>
          <input
            className="input"
            placeholder={t('support.replyPlaceholder')}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>
            {sending ? '…' : t('support.send')}
          </button>
        </form>
      )}

      <div style={{ marginTop: 14, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
        <TicketAttachments ticketId={ticket.id} canUpload={!closed} />
      </div>
    </div>
  );
}
