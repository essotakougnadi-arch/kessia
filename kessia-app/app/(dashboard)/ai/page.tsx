import type { Metadata } from 'next';
import { Suspense } from 'react';
import AiClient from './ai-client';

export const metadata: Metadata = {
  title: 'KESSIA AI — Assistant financier',
  description: 'Votre assistant financier personnel intelligent',
};

export default function AIPage() {
  return (
    <Suspense fallback={null}>
      <AiClient />
    </Suspense>
  );
}
