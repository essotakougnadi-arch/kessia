// ============================================================
// KESSIA — PATCH /api/v1/admin/fraud/[id]  (§32, §45)
// Décision humaine sur une alerte anti-fraude.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { requireAdmin, COMPLIANCE_ROLES } from '@/lib/auth/admin';
import { recordAudit } from '@/lib/audit/audit.service';
import { notify } from '@/lib/notifications/notify';
import { ok, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const schema = z.object({
  status: z.enum(['REVIEWING', 'CONFIRMED', 'DISMISSED']),
  note: z.string().max(500).optional().or(z.literal('')),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await requireAdmin(request, COMPLIANCE_ROLES);
    if (error || !context) return error!;

    const alert = await prisma.fraudAlert.findUnique({ where: { id: params.id } });
    if (!alert) return notFound('Alerte introuvable.');

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const done = parsed.data.status === 'CONFIRMED' || parsed.data.status === 'DISMISSED';
    await prisma.fraudAlert.update({
      where: { id: alert.id },
      data: {
        status: parsed.data.status,
        decisionNote: parsed.data.note || null,
        reviewedById: done ? context.userId : null,
        reviewedAt: done ? new Date() : null,
      },
    });

    void recordAudit({
      userId: context.userId,
      action: 'fraud.alert_reviewed',
      entity: 'FraudAlert',
      entityId: alert.id,
      metadata: { status: parsed.data.status, subject: alert.userId },
      request,
    });

    if (parsed.data.status === 'CONFIRMED') {
      void notify({
        userId: alert.userId,
        category: 'SECURITY',
        priority: 'HIGH',
        title: 'Vérification de sécurité sur votre compte',
        body: 'Notre équipe a examiné une activité inhabituelle sur votre compte. Si vous êtes à l’origine de ces opérations, aucune action n’est requise ; sinon, changez votre mot de passe et contactez le support.',
        actionUrl: '/profile/security',
      });
    }

    return ok({ id: alert.id, status: parsed.data.status }, 'Alerte mise à jour.');
  } catch (e) {
    logApiError('/v1/admin/fraud/[id]', e);
    return serverError();
  }
}
