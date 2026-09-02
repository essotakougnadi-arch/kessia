import type { Metadata } from 'next';
import { Suspense } from 'react';
import SimulatorClient from './simulator-client';

export const metadata: Metadata = {
  title: 'Simulateurs — KESSIA',
};

export default function SimulatorPage() {
  return (
    <Suspense fallback={null}>
      <SimulatorClient />
    </Suspense>
  );
}
