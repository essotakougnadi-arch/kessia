import type { Metadata } from 'next';
import ItemClient from './item-client';

export const metadata: Metadata = {
  title: 'Article — Marketplace KESSIA',
};

export default function MarketplaceItemPage({ params }: { params: { id: string } }) {
  return <ItemClient id={params.id} />;
}
