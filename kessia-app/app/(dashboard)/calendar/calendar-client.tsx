'use client';
// ============================================================
// KESSIA — Agenda (cahier des charges §26)
// ============================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './calendar.module.css';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { useCalendar } from '@/hooks/useCalendar';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';
import type { CalendarEvent, CalendarEventType } from '@/lib/calendar/aggregate';

const TYPE_ICON: Record<CalendarEventType, string> = {
  TONTINE: '🔄', INVOICE: '🧾', GROWTH: '🌱', FOLLOWUP: '📞',
};

function dayKey(iso: string) { return new Date(iso).toISOString().slice(0, 10); }

export default function CalendarClient() {
  const t = useT();
  const { calendar, isLoading, error, refresh } = useCalendar();
  const [filter, setFilter] = useState<'ALL' | CalendarEventType>('ALL');

  function dayLabel(key: string) {
    const d = new Date(key + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (diff === 0) return t('calendar.today');
    if (diff === 1) return t('calendar.tomorrow');
    if (diff === -1) return t('calendar.yesterday');
    return formatDate(d);
  }

  const groups = useMemo(() => {
    const events = (calendar?.events ?? []).filter((e) => filter === 'ALL' || e.type === filter);
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = dayKey(e.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return [...map.entries()];
  }, [calendar, filter]);

  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/home" className={styles.back} aria-label={t('calendar.back')}>←</Link>
        <div>
          <h1 className={styles.title}>{t('calendar.title')}</h1>
          <div className={styles.sub}>{t('calendar.subtitle')}</div>
        </div>
      </header>

      {error && !isLoading && <ErrorNote message={t('calendar.loadError')} onRetry={refresh} />}

      <div className={styles.body}>
        {isLoading && !calendar && <p className={styles.empty}>{t('calendar.loading')}</p>}

        {calendar && (
          <>
            <div className={styles.summary}>
              <div className={styles.stat}>
                <div className={`${styles.statNum} ${calendar.counts.overdue ? styles.warn : ''}`}>{calendar.counts.overdue}</div>
                <div className={styles.statLabel}>{t('calendar.overdue')}</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNum}>{calendar.counts.next7d}</div>
                <div className={styles.statLabel}>{t('calendar.thisWeek')}</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statNum}>{calendar.counts.total}</div>
                <div className={styles.statLabel}>{t('calendar.total')}</div>
              </div>
            </div>

            <div className={styles.filterBar}>
              {(['ALL', 'TONTINE', 'INVOICE', 'GROWTH', 'FOLLOWUP'] as const).map((f) => (
                <button key={f} className={`${styles.chip} ${filter === f ? styles.chipOn : ''}`} onClick={() => setFilter(f)}>
                  {f === 'ALL' ? t('calendar.filterAll') : t(`calendar.type.${f}`)}
                </button>
              ))}
            </div>

            {groups.length === 0 && <p className={styles.empty}>{t('calendar.empty')}</p>}

            {groups.map(([key, events]) => (
              <div key={key} className={styles.dayGroup}>
                <div className={`${styles.dayLabel} ${key === todayKey ? styles.today : ''}`}>{dayLabel(key)}</div>
                {events.map((e) => (
                  <Link key={e.id} href={e.href} className={`${styles.event} ${e.overdue ? styles.eventOverdue : ''}`}>
                    <span className={styles.icon}>{TYPE_ICON[e.type]}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={styles.eventTitle}>{e.title}</div>
                      <div className={styles.eventDetail}>
                        {e.overdue && <span className={styles.overdueTag}>{t('calendar.overdueTag')}</span>}
                        {e.detail}
                      </div>
                    </div>
                    {e.amount != null && <span className={styles.eventAmount}>{formatCurrency(e.amount)}</span>}
                  </Link>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
