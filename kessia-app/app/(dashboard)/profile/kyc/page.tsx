import type { Metadata } from 'next';
import KycClient from './kyc-client';

export const metadata: Metadata = {
  title: 'Vérification KYC — KESSIA',
  description: 'Vérifiez votre identité pour accéder à toutes les fonctionnalités KESSIA.',
};

export default function KycPage() {
  return <KycClient />;
}
