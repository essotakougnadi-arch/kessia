import type { Metadata } from 'next';
import DiasporaClient from './diaspora-client';

export const metadata: Metadata = {
  title: 'KESSIA Global / Diaspora',
  description: 'Rester connecté·e à l’entrepreneuriat togolais depuis l’étranger.',
};

export default function DiasporaPage() {
  return <DiasporaClient />;
}
