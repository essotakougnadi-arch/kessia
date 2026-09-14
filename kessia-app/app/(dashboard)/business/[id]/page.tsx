import type { Metadata } from 'next';
import { Suspense } from 'react';
import BusinessDetailClient from './business-detail-client';

export const metadata: Metadata = {
  title: 'Business — KESSIA',
};

export default async function BusinessDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return (
    <Suspense fallback={null}>
      <BusinessDetailClient id={params.id} />
    </Suspense>
  );
}
