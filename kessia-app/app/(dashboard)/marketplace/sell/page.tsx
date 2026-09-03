import type { Metadata } from 'next';
import SellClient from './sell-client';

export const metadata: Metadata = {
  title: 'Vendre un article — Marketplace KESSIA',
};

export default function SellPage() {
  return <SellClient />;
}
