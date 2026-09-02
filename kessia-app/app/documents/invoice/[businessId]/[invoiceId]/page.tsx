import { Suspense } from 'react';
import InvoiceDocumentClient from './invoice-document-client';

export default function InvoiceDocumentPage({
  params,
}: {
  params: { businessId: string; invoiceId: string };
}) {
  return (
    <Suspense fallback={null}>
      <InvoiceDocumentClient businessId={params.businessId} invoiceId={params.invoiceId} />
    </Suspense>
  );
}
