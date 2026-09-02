import type { Metadata } from 'next';
import ContractClient from './contract-client';

export const metadata: Metadata = {
  title: 'Contrat de la tontine — KESSIA',
};

export default function TontineContractPage({ params }: { params: { id: string } }) {
  return <ContractClient id={params.id} />;
}
