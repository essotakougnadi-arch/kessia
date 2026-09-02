import { Suspense } from 'react';
import ReceiptDocumentClient from './receipt-document-client';

export default function ReceiptDocumentPage({ params }: { params: { txId: string } }) {
  return (
    <Suspense fallback={null}>
      <ReceiptDocumentClient txId={params.txId} />
    </Suspense>
  );
}
