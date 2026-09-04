import type { Metadata } from 'next';
import InsuranceClient from './insurance-client';

export const metadata: Metadata = {
  title: 'KESSIA Insurance',
  description: 'Se protéger via des partenaires habilités — ouverture après validation réglementaire.',
};

export default function InsurancePage() {
  return <InsuranceClient />;
}
