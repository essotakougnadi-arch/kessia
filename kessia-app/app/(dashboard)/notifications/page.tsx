import type { Metadata } from 'next';
import NotificationsClient from './notifications-client';

export const metadata: Metadata = {
  title: 'Notifications — KESSIA',
  description: 'Centre de notifications KESSIA',
};

export default function NotificationsPage() {
  return <NotificationsClient />;
}
