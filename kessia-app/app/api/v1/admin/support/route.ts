import { NextRequest } from 'next/server';
import { requireAdmin, SUPPORT_ROLES } from '@/lib/auth/admin';
import prisma from '@/lib/db/prisma';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin(request, SUPPORT_ROLES);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const tickets = await prisma.supportTicket.findMany({
      where: status
        ? { status: status as never }
        : { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 60,
      include: {
        user: { select: { firstName: true, lastName: true, phone: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
        _count: { select: { messages: true } },
      },
    });

    return ok(
      tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        messageCount: t._count.messages,
        user: t.user,
        assignedTo: t.assignedTo,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
    );
  } catch (e) {
    logApiError('/v1/admin/support', e);
    return serverError();
  }
}
