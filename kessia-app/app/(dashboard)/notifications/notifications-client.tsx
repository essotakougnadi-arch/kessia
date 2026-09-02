'use client';
// ============================================================
// KESSIA — Notifications (Client Component)
// ============================================================

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './notifications.module.css';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { useNotifications, type KessiaNotification } from '@/hooks/useNotifications';
import { formatRelativeDate } from '@/lib/utils/format';
import type { NotificationCategory } from '@prisma/client';

const CAT_META: Record<NotificationCategory, { css: string; label: string; icon: string }> = {
  SECURITY: { css: 'security', label: 'Sécurité', icon: '🛡️' },
  PAYMENT: { css: 'payment', label: 'Paiement', icon: '✅' },
  TONTINE: { css: 'tontine', label: 'Tontine', icon: '🔄' },
  BUSINESS: { css: 'business', label: 'Business', icon: '📊' },
  SUPPORT: { css: 'system', label: 'Support', icon: '💬' },
  SYSTEM: { css: 'system', label: 'Système', icon: '✨' },
  PROMOTION: { css: 'system', label: 'Offre', icon: '🎁' },
};

const FILTERS = [
  { key: 'all', label: 'Tout' },
  { key: 'unread', label: 'Non lues' },
  { key: 'TONTINE', label: 'Tontine' },
  { key: 'PAYMENT', label: 'Paiement' },
  { key: 'BUSINESS', label: 'Business' },
  { key: 'SECURITY', label: 'Sécurité' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export default function NotificationsClient() {
  const router = useRouter();
  const { notifications, unreadCount, isLoading, error, refresh, markRead } = useNotifications();
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'unread') return notifications.filter((n) => !n.isRead);
    return notifications.filter((n) => n.category === filter);
  }, [notifications, filter]);

  function handleClick(n: KessiaNotification) {
    if (!n.isRead) markRead([n.id]);
    if (n.actionUrl) router.push(n.actionUrl);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Notifications</h1>
          {unreadCount > 0 && (
            <div className={styles.headerBadge}>{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</div>
          )}
        </div>
        <button
          className={styles.markAllBtn}
          id="btn-mark-all-read"
          onClick={() => markRead()}
          disabled={unreadCount === 0}
        >
          Tout marquer lu
        </button>
      </header>

      {error && !isLoading && (
        <ErrorNote message="Impossible de charger vos notifications." onRetry={refresh} />
      )}

      <div className={styles.filters}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`${styles.filterBtn} ${filter === f.key ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {isLoading &&
          [0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.notifCard}>
              <div className={styles.notifIconWrap}>
                <div className={styles.notifIcon}>⏳</div>
              </div>
              <div className={styles.notifContent}>
                <div className={styles.notifTitle}>Chargement…</div>
                <div className={styles.notifMessage}>&nbsp;</div>
              </div>
            </div>
          ))}

        {!isLoading &&
          filtered.map((n) => {
            const meta = CAT_META[n.category] ?? CAT_META.SYSTEM;
            return (
              <div
                key={n.id}
                role={n.actionUrl ? 'link' : undefined}
                className={`${styles.notifCard} ${!n.isRead ? styles.notifUnread : ''} ${
                  n.priority === 'CRITICAL' || n.priority === 'HIGH' ? styles.notifUrgent : ''
                }`}
                style={n.actionUrl || !n.isRead ? { cursor: 'pointer' } : undefined}
                id={`notif-${n.id}`}
                onClick={() => handleClick(n)}
              >
                <div className={styles.notifIconWrap}>
                  <div className={`${styles.notifIcon} ${styles[`notifIcon_${meta.css}`]}`}>{meta.icon}</div>
                </div>
                <div className={styles.notifContent}>
                  <div className={styles.notifHeader}>
                    <div className={styles.notifTitle}>{n.title}</div>
                    <div className={styles.notifTime}>{formatRelativeDate(n.createdAt)}</div>
                  </div>
                  <div className={styles.notifMessage}>{n.body}</div>
                  <div className={styles.notifMeta}>
                    <span className={`${styles.notifCatBadge} ${styles[`cat_${meta.css}`]}`}>{meta.label}</span>
                    {!n.isRead && <span className={styles.unreadDot} />}
                  </div>
                </div>
              </div>
            );
          })}

        {!isLoading && !error && filtered.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔔</div>
            <div className={styles.emptyTitle}>
              {notifications.length === 0 ? 'Aucune notification' : 'Rien à afficher'}
            </div>
            <div className={styles.emptyDesc}>
              {notifications.length === 0 ? 'Vous êtes à jour !' : 'Aucune notification pour ce filtre.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
