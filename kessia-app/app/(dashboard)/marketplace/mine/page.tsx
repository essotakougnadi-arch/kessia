import type { Metadata } from 'next';
import MineClient from './mine-client';

export const metadata: Metadata = {
  title: 'Mes articles & achats — Marketplace KESSIA',
};

export default function MinePage() {
  return <MineClient />;
}
