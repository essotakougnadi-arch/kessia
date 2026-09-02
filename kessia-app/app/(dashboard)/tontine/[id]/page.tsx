import type { Metadata } from 'next';
import TontineDetailClient from './tontine-detail-client';

export const metadata: Metadata = {
  title: 'Détail Tontine — KESSIA',
};

export default function TontineDetailPage({ params }: { params: { id: string } }) {
  return <TontineDetailClient id={params.id} />;
}
