import type { Metadata } from 'next';
import TrustClient from './trust-client';

export const metadata: Metadata = {
  title: 'Transparence & tarifs — KESSIA',
};

export default function TrustPage() {
  return <TrustClient />;
}
