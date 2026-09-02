'use client';
// ============================================================
// KESSIA — Préférences de notification (§33)
// SECURITY est toujours actif (non désactivable).
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './notifications.module.css';
import { useUiStore } from '@/store/uiStore';
import { useProfile, type NotificationPrefs } from '@/hooks/useProfile';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { useT } from '@/lib/i18n';

type PrefKey = keyof NotificationPrefs;

const ITEMS: { key: PrefKey; icon: string; tk: string }[] = [
  { key: 'notifyPayment', icon: '💳', tk: 'notifPayment' },
  { key: 'notifyTontine', icon: '🔄', tk: 'notifTontine' },
  { key: 'notifyBusiness', icon: '🏪', tk: 'notifBusiness' },
  { key: 'notifySupport', icon: '💬', tk: 'notifSupport' },
  { key: 'notifySystem', icon: 'ℹ️', tk: 'notifSystem' },
  { key: 'notifyPromotion', icon: '🎁', tk: 'notifPromotion' },
];

export default function NotificationsPrefsClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { profile, isLoading, error, refresh, updateProfile } = useProfile();

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState<PrefKey | null>(null);

  useEffect(() => {
    if (profile?.notifications) setPrefs(profile.notifications);
  }, [profile]);

  async function toggle(key: PrefKey) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    const r = await updateProfile({ notifications: { [key]: next[key] } });
    setSaving(null);
    if (!r.success) {
      setPrefs(prefs); // rollback
      addToast({ type: 'error', message: r.message });
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/profile" className={styles.back} aria-label={t('notifPrefs.back')}>←</Link>
        <h1 className={styles.title}>{t('notifPrefs.title')}</h1>
      </header>

      <Link href="/notifications" className={styles.feedLink}>
        <span>{t('notifPrefs.seeAll')}</span>
        <span>→</span>
      </Link>

      {error && !isLoading && (
        <ErrorNote message={t('notifPrefs.loadError')} onRetry={refresh} />
      )}

      <div className={styles.sectionTitle} style={{ marginLeft: 20 }}>{t('notifPrefs.whatIReceive')}</div>
      <div className={styles.section}>
        {ITEMS.map((it) => (
          <div key={it.key} className={styles.row}>
            <span className={styles.rowIcon}>{it.icon}</span>
            <div className={styles.rowText}>
              <div className={styles.rowLabel}>{t(`notifPrefs.items.${it.tk}.label`)}</div>
              <div className={styles.rowDesc}>{t(`notifPrefs.items.${it.tk}.desc`)}</div>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={prefs?.[it.key] ?? true}
                disabled={!prefs || saving !== null}
                onChange={() => toggle(it.key)}
              />
              <span className={styles.slider} />
            </label>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.row}>
          <span className={styles.rowIcon}>🔒</span>
          <div className={styles.rowText}>
            <div className={styles.rowLabel}>{t('notifPrefs.securityLabel')}</div>
            <div className={styles.rowDesc}>{t('notifPrefs.securityDesc')}</div>
          </div>
          <span className={styles.locked}>{t('notifPrefs.always')}</span>
        </div>
      </div>
    </div>
  );
}
