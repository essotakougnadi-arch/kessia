import type { Metadata } from 'next';
import { Suspense } from 'react';
import BusinessDetailClient from './business-detail-client';

export const metadata: Metadata = {
  title: 'Business — KESSIA',
};

export default function BusinessDetailPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <BusinessDetailClient id={params.id} />
    </Suspense>
  );
}
