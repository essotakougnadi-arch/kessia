// ============================================================
// KESSIA — GET/POST /api/v1/support/[id]/messages
// Messages d'un ticket de support
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { assertOwnership } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, created, notFound, forbidden, validationError, serverError, badRequest } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const messageSchema = z.object({
  content: z.string().min(1, 'Message vide').max(2000, 'Message trop long'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { userId: true, assignedToId: true },
    });

    if (!ticket) return notFound('Ticket introuvable.');

    const isAgent =
      ticket.assignedToId === context.userId ||
      ['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(context.role);
    const canAccess = ticket.userId === context.userId || isAgent;

    if (!canAccess) return forbidden();

    const messages = await prisma.ticketMessage.findMany({
      // Les notes internes ne sont jamais renvoyées au demandeur
      where: { ticketId: params.id, ...(isAgent ? {} : { isInternal: false }) },
      orderBy: { createdAt: 'asc' },
    });

    return ok(messages);
  } catch (error) {
    logApiError('/v1/support/[id]/messages', error);
    return serverError();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { userId: true, status: true },
    });

    if (!ticket) return notFound('Ticket introuvable.');

    const canPost =
      ticket.userId === context.userId || ['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(context.role);

    if (!canPost) return forbidden();

    if (ticket.status === 'CLOSED') {
      return badRequest('Ce ticket est fermé. Ouvrez un nouveau ticket si nécessaire.');
    }

    const body = await request.json();
    const parsed = messageSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: params.id,
        authorId: context.userId,
        content: parsed.data.content,
      },
    });

    // Mettre à jour le statut du ticket si réponse utilisateur
    if (ticket.userId === context.userId && ticket.status === 'WAITING') {
      await prisma.supportTicket.update({
        where: { id: params.id },
        data: { status: 'IN_PROGRESS' },
      });
    }

    return created(message, 'Message envoyé.');
  } catch (error) {
    logApiError('/v1/support/[id]/messages', error);
    return serverError();
  }
}
