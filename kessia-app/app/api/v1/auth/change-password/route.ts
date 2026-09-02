import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { recordAudit } from '@/lib/audit/audit.service';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { ok, badRequest, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, 'Au moins 8 caractères')
    .regex(/[A-Z]/, 'Au moins une majuscule')
    .regex(/[0-9]/, 'Au moins un chiffre'),
});

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'auth.change-password', { limit: 5, windowMs: 15 * 60_000, by: context.userId });
    if (limited) return limited;

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const user = await prisma.user.findUnique({ where: { id: context.userId } });
    if (!user?.passwordHash) return badRequest('Compte sans mot de passe.');
    if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      void recordAudit({ userId: user.id, action: 'auth.change_password_failed', entity: 'User', entityId: user.id, request });
      return badRequest('Mot de passe actuel incorrect.');
    }
    if (await bcrypt.compare(parsed.data.newPassword, user.passwordHash)) {
      return badRequest('Le nouveau mot de passe doit être différent.');
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      // Révoquer les autres sessions par sécurité
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.notification.create({
        data: {
          userId: user.id, category: 'SECURITY', priority: 'HIGH',
          title: 'Mot de passe modifié',
          body: 'Votre mot de passe KESSIA vient d\'être changé. Si ce n\'est pas vous, contactez le support immédiatement.',
        },
      }),
    ]);

    void recordAudit({ userId: user.id, action: 'auth.change_password', entity: 'User', entityId: user.id, request });
    return ok(null, 'Mot de passe modifié. Reconnectez-vous.');
  } catch (e) {
    logApiError('/v1/auth/change-password', e);
    return serverError();
  }
}
