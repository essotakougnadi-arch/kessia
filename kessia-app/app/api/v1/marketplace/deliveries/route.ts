// ============================================================
// KESSIA — POST /api/v1/marketplace/deliveries
// Demande une livraison Miaride pour une commande réglée (wallet).
//   mode SIMULATED : frais débités, coursier fictif, suivi qui avance
//   mode HANDOFF   : bon préparé + lien Miaride, frais réglés hors-app
// ============================================================

import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withAuth } from '@/lib/auth/middleware';
import { requestDeliverySchema } from '@/lib/validations/marketplace';
import { requestDelivery } from '@/lib/delivery';
import { createAddress } from '@/lib/marketplace/addresses';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';
import { created, badRequest, conflict, forbidden, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'marketplace.delivery', {
      limit: 20, windowMs: 60 * 60_000, by: context.userId,
    });
    if (limited) return limited;

    const parsed = requestDeliverySchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const body = parsed.data;

    // Adresse : carnet ou saisie libre.
    let dropoffZone = body.dropoffZone;
    let dropoffAddress = body.dropoffAddress;
    let recipientPhone = body.recipientPhone;
    if (body.addressId) {
      const addr = await prisma.deliveryAddress.findFirst({
        where: { id: body.addressId, userId: context.userId },
      });
      if (!addr) return notFound('Adresse introuvable dans votre carnet.');
      dropoffZone = addr.area;
      dropoffAddress = addr.address;
      recipientPhone = addr.recipientPhone;
    }
    if (!dropoffZone || !dropoffAddress || !recipientPhone) {
      return badRequest('Adresse de livraison incomplète.');
    }

    const result = await requestDelivery({
      orderId: body.orderId,
      userId: context.userId,
      mode: body.mode,
      dropoffZone,
      dropoffAddress,
      recipientPhone,
      alsoOrderIds: body.alsoOrderIds,
      schedule: body.schedule,
    });

    if (result.ok && body.saveAddress && !body.addressId) {
      await createAddress(context.userId, {
        label: body.saveAddressLabel?.trim() || 'Livraison',
        area: dropoffZone,
        address: dropoffAddress,
        recipientPhone,
      }).catch(() => null);
    }

    if (!result.ok) {
      switch (result.code) {
        case 'NOT_FOUND': return notFound(result.error);
        case 'FORBIDDEN': return forbidden(result.error);
        case 'CONFLICT': return conflict(result.error);
        case 'ZONE':
        case 'BALANCE':
        case 'DISABLED':
        default: return badRequest(result.error);
      }
    }

    void recordAudit({
      userId: context.userId,
      action: 'marketplace.delivery.request',
      entity: 'MarketplaceDelivery',
      entityId: result.delivery.id,
      metadata: { mode: body.mode, orderId: body.orderId },
      request,
    });

    return created(
      {
        deliveryId: result.delivery.id,
        status: result.delivery.status,
        mode: result.delivery.mode,
        feeAmount: Number(result.delivery.feeAmount),
        handoffUrl: result.handoffUrl ?? null,
      },
      result.delivery.mode === 'HANDOFF'
        ? 'Bon de livraison prêt — finalisez sur Miaride.'
        : 'Livraison demandée. Un coursier va récupérer le colis.'
    );
  } catch (err) {
    logApiError('/v1/marketplace/deliveries', err);
    return serverError();
  }
}
