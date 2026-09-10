// ============================================================
// KESSIA — /api/v1/marketplace/addresses
//   GET  : carnet d'adresses de livraison de l'acheteur
//   POST : ajoute une adresse
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { createAddressSchema } from '@/lib/validations/marketplace';
import { listAddresses, createAddress } from '@/lib/marketplace/addresses';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { ok, created, badRequest, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const MAX_ADDRESSES = 15;

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;
    return ok({ addresses: await listAddresses(context.userId) });
  } catch (err) {
    logApiError('/v1/marketplace/addresses GET', err);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'marketplace.address', {
      limit: 30, windowMs: 60 * 60_000, by: context.userId,
    });
    if (limited) return limited;

    const parsed = createAddressSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const existing = await listAddresses(context.userId);
    if (existing.length >= MAX_ADDRESSES) {
      return badRequest(`Carnet plein (${MAX_ADDRESSES} adresses maximum).`);
    }

    const address = await createAddress(context.userId, parsed.data);
    return created({ address }, 'Adresse enregistrée.');
  } catch (err) {
    logApiError('/v1/marketplace/addresses POST', err);
    return serverError();
  }
}
