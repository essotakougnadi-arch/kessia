import { Suspense } from 'react';
import ReceiptDocumentClient from './receipt-document-client';

export default async function ReceiptDocumentPage(props: { params: Promise<{ txId: string }> }) {
  const params = await props.params;
  return (
    <Suspense fallback={null}>
      <ReceiptDocumentClient txId={params.txId} />
    </Suspense>
  );
}
