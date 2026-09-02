import type { Metadata } from 'next';
import NotificationsPrefsClient from './notifications-client';

export const metadata: Metadata = {
  title: 'Notifications — KESSIA',
};

export default function NotificationsPrefsPage() {
  return <NotificationsPrefsClient />;
}
