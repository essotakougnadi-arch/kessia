import { Suspense } from 'react';
import InvoiceDocumentClient from './invoice-document-client';

export default async function InvoiceDocumentPage(
  props: {
    params: Promise<{ businessId: string; invoiceId: string }>;
  }
) {
  const params = await props.params;
  return (
    <Suspense fallback={null}>
      <InvoiceDocumentClient businessId={params.businessId} invoiceId={params.invoiceId} />
    </Suspense>
  );
}
