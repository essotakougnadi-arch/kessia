import type { Metadata } from 'next';
import { Suspense } from 'react';
import MarketplaceClient from './marketplace-client';

export const metadata: Metadata = {
  title: 'Marketplace — KESSIA',
  description: 'Achetez et vendez au sein de la communauté KESSIA. Paiement wallet ou par tontine.',
};

export default function MarketplacePage() {
  return (
    <Suspense fallback={null}>
      <MarketplaceClient />
    </Suspense>
  );
}
