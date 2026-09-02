import type { Metadata } from 'next';
import { Suspense } from 'react';
import WalletClient from './wallet-client';

export const metadata: Metadata = {
  title: 'Wallet — KESSIA',
  description: 'Gérez votre wallet KESSIA, vos transferts et votre épargne.',
};

export default function WalletPage() {
  return (
    <Suspense fallback={null}>
      <WalletClient />
    </Suspense>
  );
}
