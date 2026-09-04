import type { Metadata } from 'next';
import LoansClient from './loans-client';

export const metadata: Metadata = {
  title: 'Prêts coopératifs — KESSIA',
  description: 'S’entraider entre membres — ouverture après validation réglementaire.',
};

export default function LoansPage() {
  return <LoansClient />;
}
