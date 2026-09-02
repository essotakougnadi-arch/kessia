import type { Metadata } from 'next';
import BusinessClient from './business-client';

export const metadata: Metadata = {
  title: 'Business — KESSIA',
  description: 'Gérez vos activités commerciales',
};

export default function BusinessPage() {
  return <BusinessClient />;
}
