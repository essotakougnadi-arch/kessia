import type { Metadata } from 'next';
import PrivacyClient from './privacy-client';

export const metadata: Metadata = {
  title: 'Confidentialité — KESSIA',
};

export default function PrivacyPage() {
  return <PrivacyClient />;
}
