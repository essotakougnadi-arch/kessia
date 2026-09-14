import type { Metadata } from 'next';
import ItemClient from './item-client';

export const metadata: Metadata = {
  title: 'Article — Marketplace KESSIA',
};

export default async function MarketplaceItemPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <ItemClient id={params.id} />;
}
