// ============================================================
// KESSIA — GET/PATCH /api/v1/admin/users/[id]  (§45)
// Consultation d'un utilisateur + actions de modération
// (suspension / réactivation). La suspension coupe l'accès :
// `isActive=false` bloque la connexion et on révoque les sessions.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin, COMPLIANCE_ROLES } from '@/lib/auth/admin';
import prisma from '@/lib/db/prisma';
import { recordAudit } from '@/lib/audit/audit.service';
import { ok, badRequest, notFound, forbidden, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  action: z.enum(['suspend', 'reactivate']),
  reason: z.string().max(500).optional(),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true, firstName: true, lastName: true, phone: true, email: true,
        role: true, isActive: true, kycStatus: true, kycLevel: true,
        twoFactorEnabled: true, createdAt: true, lastLoginAt: true, deletionRequestedAt: true,
        wallet: { select: { balance: true, currency: true, isLocked: true } },
        _count: { select: { tontineMembers: true, businesses: true, supportTickets: true } },
      },
    });
    if (!user) return notFound('Utilisateur introuvable.');

    return ok({
      ...user,
      balance: user.wallet ? Number(user.wallet.balance) : 0,
    });
  } catch (e) {
    logApiError('/v1/admin/users/[id]', e);
    return serverError();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // La modération de comptes est réservée aux rôles conformité / admin.
    const { error, context } = await requireAdmin(request, COMPLIANCE_ROLES);
    if (error || !context) return error ?? serverError();

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { action, reason } = parsed.data;

    if (params.id === context.userId) {
      return forbidden('Vous ne pouvez pas modérer votre propre compte.');
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, isActive: true, role: true },
    });
    if (!target) return notFound('Utilisateur introuvable.');
    if (target.role !== 'USER' && target.role !== 'BUSINESS_OWNER' && target.role !== 'TONTINE_MANAGER') {
      return forbidden("Ce compte a un rôle privilégié — modération manuelle requise.");
    }

    const suspend = action === 'suspend';
    if (target.isActive === !suspend) {
      return badRequest(suspend ? 'Ce compte est déjà suspendu.' : 'Ce compte est déjà actif.');
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: target.id }, data: { isActive: !suspend } }),
      ...(suspend ? [prisma.session.deleteMany({ where: { userId: target.id } })] : []),
      prisma.notification.create({
        data: {
          userId: target.id,
          category: 'SECURITY',
          priority: 'HIGH',
          title: suspend ? 'Compte suspendu' : 'Compte réactivé',
          body: suspend
            ? `Votre compte KESSIA a été suspendu${reason ? ` : ${reason}` : '.'} Contactez le support.`
            : 'Votre compte KESSIA a été réactivé. Vous pouvez vous reconnecter.',
        },
      }),
    ]);

    void recordAudit({
      userId: context.userId,
      action: suspend ? 'admin.user_suspend' : 'admin.user_reactivate',
      entity: 'User',
      entityId: target.id,
      metadata: reason ? { reason } : undefined,
      request,
    });

    return ok({ id: target.id, isActive: !suspend }, suspend ? 'Compte suspendu.' : 'Compte réactivé.');
  } catch (e) {
    logApiError('/v1/admin/users/[id]', e);
    return serverError();
  }
}
