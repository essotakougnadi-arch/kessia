// ============================================================
// KESSIA — /api/v1/marketplace/addresses/[id]
//   PATCH  : modifie une adresse du carnet
//   DELETE : la supprime
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { updateAddressSchema } from '@/lib/validations/marketplace';
import { updateAddress, deleteAddress } from '@/lib/marketplace/addresses';
import { ok, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const parsed = updateAddressSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const address = await updateAddress(context.userId, params.id, parsed.data);
    if (!address) return notFound('Adresse introuvable.');
    return ok({ address }, 'Adresse mise à jour.');
  } catch (err) {
    logApiError('/v1/marketplace/addresses/[id] PATCH', err);
    return serverError();
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const removed = await deleteAddress(context.userId, params.id);
    if (!removed) return notFound('Adresse introuvable.');
    return ok({ deleted: true }, 'Adresse supprimée.');
  } catch (err) {
    logApiError('/v1/marketplace/addresses/[id] DELETE', err);
    return serverError();
  }
}
