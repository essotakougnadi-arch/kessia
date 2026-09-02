'use client';

import Link from 'next/link';
import { useAdminOverview } from '@/hooks/useAdmin';
import { useT } from '@/lib/i18n';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { forbidden, isLoading } = useAdminOverview();
  const t = useT();

  if (isLoading) {
    return <div style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>{t('admin.guard.loading')}</div>;
  }

  if (forbidden) {
    return (
      <div style={{
        maxWidth: 440, margin: '80px auto', textAlign: 'center',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 16, padding: 32,
      }}>
        <div style={{ fontSize: 44 }}>🔒</div>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: '10px 0 6px' }}>{t('admin.guard.forbiddenTitle')}</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {t('admin.guard.forbiddenBody')}
        </p>
        <Link href="/home" style={{ display: 'inline-block', marginTop: 16, fontWeight: 700, color: 'var(--color-primary)' }}>
          {t('admin.guard.backToApp')}
        </Link>
      </div>
    );
  }

  return (
    <>
      <OfflineBanner />
      {children}
    </>
  );
}
