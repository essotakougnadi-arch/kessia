import type { Metadata } from 'next';
import TontineDetailClient from './tontine-detail-client';

export const metadata: Metadata = {
  title: 'Détail Tontine — KESSIA',
};

export default async function TontineDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <TontineDetailClient id={params.id} />;
}
