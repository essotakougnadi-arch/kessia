// ============================================================
// KESSIA — useNotifications Hook
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend } from '@/lib/api/client';
import type { NotificationCategory, NotificationPriority } from '@prisma/client';

export type KessiaNotification = {
  id: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  actionUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

type NotificationsPayload = {
  notifications: KessiaNotification[];
  unreadCount: number;
  meta: { page: number; limit: number; total: number; hasMore: boolean };
};

export function useNotifications() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<NotificationsPayload>(
    accessToken ? ['/api/v1/notifications?limit=50', accessToken] : null,
    ([url]: [string, string]) => apiGet<NotificationsPayload>(url),
    { revalidateOnFocus: false }
  );

  async function markRead(ids?: string[]) {
    // Optimiste
    if (data) {
      mutate(
        {
          ...data,
          notifications: data.notifications.map((n) =>
            !ids || ids.includes(n.id) ? { ...n, isRead: true } : n
          ),
          unreadCount: ids
            ? Math.max(0, data.unreadCount - ids.filter((id) => data.notifications.find((n) => n.id === id && !n.isRead)).length)
            : 0,
        },
        false
      );
    }
    await apiSend('/api/v1/notifications', 'PATCH', ids ? { ids } : {});
    mutate();
  }

  return {
    notifications: data?.notifications ?? [],
    unreadCount: data?.unreadCount ?? 0,
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    markRead,
  };
}
