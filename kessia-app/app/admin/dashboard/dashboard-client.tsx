'use client';
// ============================================================
// KESSIA — Dashboard Admin (données réelles, §45)
// ============================================================

import Link from 'next/link';
import { useAdminOverview, useAdminAnalytics } from '@/hooks/useAdmin';
import { formatCurrency, formatRelativeDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';
import type { KycStatus } from '@prisma/client';

const SEV_COLOR: Record<string, string> = { urgent: '#EF4444', warn: '#F59E0B', info: '#3B82F6' };

const KYC_STYLE: Record<KycStatus, { bg: string; color: string }> = {
  VERIFIED: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10B981' },
  UNDER_REVIEW: { bg: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B' },
  IN_PROGRESS: { bg: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6' },
  ACTION_REQUIRED: { bg: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B' },
  REJECTED: { bg: 'rgba(239, 68, 68, 0.12)', color: '#EF4444' },
  EXPIRED: { bg: 'rgba(156, 142, 126, 0.12)', color: '#9C8E7E' },
  NOT_STARTED: { bg: 'rgba(156, 142, 126, 0.12)', color: '#9C8E7E' },
};

const card = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 16,
  padding: 20,
} as const;

export default function AdminDashboardClient() {
  const t = useT();
  const { overview, isLoading, forbidden, error, refresh } = useAdminOverview();
  const { data: analytics } = useAdminAnalytics();

  if (forbidden) {
    return (
      <div style={{ ...card, maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: '10px 0 6px' }}>{t('admin.guard.forbiddenTitle')}</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {t('admin.guard.forbiddenBodyShort')}
        </p>
        <Link href="/home" style={{ display: 'inline-block', marginTop: 16, fontWeight: 700, color: 'var(--color-primary)' }}>
          {t('admin.guard.backToApp')}
        </Link>
      </div>
    );
  }

  if (error && !isLoading) {
    return (
      <div style={{ ...card, maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '10px 0' }}>
          {t('admin.dashboard.cannotLoad')}
        </p>
        <button onClick={refresh} className="btn btn-primary btn-sm">{t('admin.common.retry')}</button>
      </div>
    );
  }

  const kpis = [
    { icon: '👥', label: t('admin.dashboard.kpiUsers'), value: overview?.users.total, sub: t('admin.dashboard.kpiUsersSub', { n: overview?.users.thisMonth ?? 0 }), color: '#B65A3A' },
    { icon: '🛡️', label: t('admin.dashboard.kpiKyc'), value: overview?.kyc.pending, sub: t('admin.dashboard.kpiKycSub'), color: '#EF4444' },
    { icon: '🔄', label: t('admin.dashboard.kpiTontines'), value: overview?.tontines.active, sub: t('admin.dashboard.kpiTontinesSub'), color: '#1F5D4A' },
    { icon: '💳', label: t('admin.dashboard.kpiVolume'), value: overview ? formatCurrency(overview.transactions.volume, overview.transactions.currency) : undefined, sub: t('admin.dashboard.kpiVolumeSub', { n: overview?.transactions.count ?? 0 }), color: '#D6A84F' },
    { icon: '🎧', label: t('admin.dashboard.kpiTickets'), value: overview?.support.open, sub: t('admin.dashboard.kpiTicketsSub'), color: '#8B5CF6' },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, color: 'var(--color-text)' }}>{t('admin.dashboard.title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
          {t('admin.dashboard.subtitle')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ ...card, borderLeft: `3px solid ${k.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 38, height: 38, background: `${k.color}18`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{k.icon}</div>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-text)', marginBottom: 3 }}>
              {isLoading || k.value === undefined ? '—' : k.value}
            </div>
            <div style={{ fontSize: 11, color: k.color, fontWeight: 600 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {analytics && analytics.priorities.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{t('admin.dashboard.prioritiesTitle')}</h2>
            <Link href="/admin/analytics" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', textDecoration: 'none' }}>{t('admin.dashboard.analyticsLink')}</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analytics.priorities.map((p) => (
              <Link key={p.id} href={p.href} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textDecoration: 'none', color: 'inherit', padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 18 }}>{p.icon}</span>
                <span style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: 13 }}>{p.title}</strong>
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{p.detail}</span>
                </span>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[p.severity], marginTop: 5 }} />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>{t('admin.dashboard.recentTitle')}</h2>
          <Link href="/admin/users" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', textDecoration: 'none' }}>{t('admin.dashboard.seeAll')}</Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {[t('admin.dashboard.thUser'), t('admin.dashboard.thPhone'), t('admin.dashboard.thKyc'), t('admin.dashboard.thRole'), t('admin.dashboard.thJoined')].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} style={{ padding: '20px 16px', fontSize: 13, color: 'var(--color-text-tertiary)' }}>{t('admin.common.loading')}</td></tr>
              )}
              {!isLoading && overview?.recentUsers.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '20px 16px', fontSize: 13, color: 'var(--color-text-tertiary)' }}>{t('admin.dashboard.noUsers')}</td></tr>
              )}
              {!isLoading && overview?.recentUsers.map((u) => {
                const k = KYC_STYLE[u.kycStatus] ?? KYC_STYLE.NOT_STARTED;
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{u.firstName} {u.lastName}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--color-text-secondary)' }}>{u.phone}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, background: k.bg, color: k.color, borderRadius: 20, padding: '2px 8px' }}>{t(`admin.pill.kyc.${u.kycStatus}`)}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--color-text-secondary)' }}>{u.role}</td>
                    <td style={{ padding: '12px 16px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{formatRelativeDate(u.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 16 }}>
        {t('admin.dashboard.detailScreens')}
      </p>
    </div>
  );
}
