import type { Metadata } from 'next';
import AdminDashboardClient from './dashboard-client';

export const metadata: Metadata = {
  title: 'Dashboard Admin — KESSIA',
  description: 'Tableau de bord administration KESSIA',
};

export default function AdminDashboardPage() {
  return <AdminDashboardClient />;
}
