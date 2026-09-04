import type { Metadata } from 'next';
import InvestClient from './invest-client';

export const metadata: Metadata = {
  title: 'KESSIA Invest',
  description: 'Financer des projets, en toute transparence — ouverture après validation réglementaire.',
};

export default function InvestPage() {
  return <InvestClient />;
}
