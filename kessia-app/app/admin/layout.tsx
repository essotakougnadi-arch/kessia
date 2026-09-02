import type { Metadata } from 'next';
import AdminGuard from './AdminGuard';
import AdminSidebar from './sidebar';

export const metadata: Metadata = {
  title: 'Admin — KESSIA',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-background)' }}>
      <AdminSidebar />

      <main style={{ marginLeft: 240, flex: 1, padding: '24px', minWidth: 0 }}>
        <AdminGuard>{children}</AdminGuard>
      </main>
    </div>
  );
}
