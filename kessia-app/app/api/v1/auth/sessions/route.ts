// ============================================================
// KESSIA — GET/DELETE /api/v1/auth/sessions
// Sessions actives + révocation (cahier des charges §31)
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { extractBearerToken } from '@/lib/auth/session';
import prisma from '@/lib/db/prisma';
import { recordAudit } from '@/lib/audit/audit.service';
import { ok, badRequest, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const current = extractBearerToken(request.headers.get('authorization'));
    const sessions = await prisma.session.findMany({
      where: { userId: context.userId, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, deviceInfo: true, ipAddress: true, createdAt: true, lastUsedAt: true, token: true },
    });

    return ok(
      sessions.map((s) => ({
        id: s.id,
        device: s.deviceInfo ?? 'Appareil inconnu',
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        current: s.token === current,
      }))
    );
  } catch (e) {
    logApiError('/v1/auth/sessions', e);
    return serverError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const all = searchParams.get('all') === 'true';
    const currentToken = extractBearerToken(request.headers.get('authorization'));

    if (all) {
      await prisma.session.deleteMany({
        where: { userId: context.userId, token: { not: currentToken ?? '' } },
      });
      void recordAudit({ userId: context.userId, action: 'auth.sessions_revoked_all', entity: 'Session', request });
      return ok(null, 'Toutes les autres sessions ont été déconnectées.');
    }

    if (!id) return badRequest('Session non précisée.');
    const target = await prisma.session.findFirst({ where: { id, userId: context.userId } });
    if (!target) return badRequest('Session introuvable.');

    await prisma.session.delete({ where: { id } });
    void recordAudit({ userId: context.userId, action: 'auth.session_revoked', entity: 'Session', entityId: id, request });
    return ok(null, 'Session déconnectée.');
  } catch (e) {
    logApiError('/v1/auth/sessions', e);
    return serverError();
  }
}
