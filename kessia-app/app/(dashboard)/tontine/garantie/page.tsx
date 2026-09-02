import type { Metadata } from 'next';
import GuaranteeClient from './guarantee-client';

export const metadata: Metadata = {
  title: 'Fonds de Garantie Solidaire — KESSIA',
};

export default function GuaranteePage() {
  return <GuaranteeClient />;
}
