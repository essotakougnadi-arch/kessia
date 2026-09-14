import type { Metadata } from 'next';
import ContractClient from './contract-client';

export const metadata: Metadata = {
  title: 'Contrat de la tontine — KESSIA',
};

export default async function TontineContractPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <ContractClient id={params.id} />;
}
