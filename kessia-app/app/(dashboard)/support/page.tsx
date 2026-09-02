import type { Metadata } from 'next';
import SupportClient from './support-client';

export const metadata: Metadata = {
  title: 'Support — KESSIA',
  description: 'Centre d\'aide et support client KESSIA',
};

export default function SupportPage() {
  return <SupportClient />;
}
