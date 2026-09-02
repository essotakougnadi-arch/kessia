// ============================================================
// KESSIA — GET/PATCH /api/v1/notifications
// Notifications de l'utilisateur
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ---- GET : Liste des notifications ----

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread') === 'true';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20'));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId: context.userId };
    if (unreadOnly) where.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: context.userId, isRead: false } }),
    ]);

    return ok({
      notifications,
      unreadCount,
      meta: {
        page,
        limit,
        total,
        hasMore: skip + notifications.length < total,
      },
    });
  } catch (error) {
    logApiError('/v1/notifications', error);
    return serverError();
  }
}

// ---- PATCH : Marquer comme lu(es) ----

export async function PATCH(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const body = await request.json().catch(() => ({}));
    const notificationIds: string[] = body.ids ?? [];

    if (notificationIds.length === 0) {
      // Marquer toutes comme lues
      await prisma.notification.updateMany({
        where: { userId: context.userId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
      return ok(null, 'Toutes les notifications ont été marquées comme lues.');
    }

    // Marquer les IDs spécifiés
    await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId: context.userId,
      },
      data: { isRead: true, readAt: new Date() },
    });

    return ok(null, `${notificationIds.length} notification(s) marquée(s) comme lue(s).`);
  } catch (error) {
    logApiError('/v1/notifications', error);
    return serverError();
  }
}
