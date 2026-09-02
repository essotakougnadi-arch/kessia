'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n';

const NAV_ITEMS = [
  { href: '/admin/dashboard', icon: '📊', key: 'dashboard' },
  { href: '/admin/users', icon: '👥', key: 'users' },
  { href: '/admin/kyc', icon: '🛡️', key: 'kyc' },
  { href: '/admin/tontines', icon: '🔄', key: 'tontines' },
  { href: '/admin/guarantee', icon: '🛟', key: 'guarantee' },
  { href: '/admin/fraud', icon: '🛡️', key: 'fraud' },
  { href: '/admin/analytics', icon: '📈', key: 'analytics' },
  { href: '/admin/transactions', icon: '💳', key: 'transactions' },
  { href: '/admin/support', icon: '🎧', key: 'support' },
  { href: '/admin/modules', icon: '🧩', key: 'modules' },
];

export default function AdminSidebar() {
  const t = useT();

  return (
    <aside
      style={{
        width: 240,
        background: 'linear-gradient(180deg, #0D0602 0%, #1A0D05 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 0',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 20,
      }}
    >
      <div style={{ padding: '0 20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#B65A3A', fontFamily: 'var(--font-display)' }}>
          KESSIA
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
          {t('admin.nav.brandSub')}
        </div>
      </div>

      <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 10,
              textDecoration: 'none',
              color: 'rgba(255,255,255,0.55)',
              fontSize: 13,
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {t(`admin.nav.${item.key}`)}
          </Link>
        ))}
      </nav>

      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Link
          href="/home"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'rgba(255,255,255,0.35)',
            textDecoration: 'none',
          }}
        >
          {t('admin.nav.backToApp')}
        </Link>
      </div>
    </aside>
  );
}
