'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet } from '@/lib/api/client';
import type { CalendarView } from '@/lib/calendar/aggregate';

export function useCalendar() {
  const token = useAuthStore((s) => s.accessToken);
  const { data, error, isLoading, mutate } = useSWR<CalendarView>(
    token ? ['/api/v1/calendar', token] : null,
    ([u]: [string, string]) => apiGet<CalendarView>(u),
    { revalidateOnFocus: false }
  );
  return { calendar: data ?? null, isLoading, error: error as Error | undefined, refresh: () => mutate() };
}
