import type { Metadata } from 'next';
import AcademyClient from './academy-client';

export const metadata: Metadata = {
  title: 'KESSIA Academy',
  description: 'Se former pour grandir : entrepreneuriat, gestion, finance, vente.',
};

export default function AcademyPage() {
  return <AcademyClient />;
}
