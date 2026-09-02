import type { Metadata } from 'next';
import { Suspense } from 'react';
import TontineClient from './tontine-client';

export const metadata: Metadata = {
  title: 'Tontines — KESSIA',
  description: 'Gérez vos tontines collectives avec KESSIA.',
};

export default function TontinePage() {
  return (
    <Suspense fallback={null}>
      <TontineClient />
    </Suspense>
  );
}
