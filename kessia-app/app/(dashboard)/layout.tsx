import type { Metadata } from 'next';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import { LegalGate } from '@/components/legal/LegalGate';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import styles from './dashboard.module.css';

export const metadata: Metadata = {
  title: 'Tableau de bord — KESSIA',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.layout}>
      <OfflineBanner />
      <Sidebar />
      <div className={styles.main}>
        {children}
      </div>
      <BottomNav />
      <LegalGate />
    </div>
  );
}
