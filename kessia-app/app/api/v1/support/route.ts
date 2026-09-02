// ============================================================
// KESSIA — GET/POST /api/v1/support
// Tickets de support utilisateur
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, created, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { recordAudit } from '@/lib/audit/audit.service';

export const dynamic = 'force-dynamic';

const createTicketSchema = z.object({
  category: z.enum(['ACCOUNT', 'KYC', 'WALLET', 'TONTINE', 'BUSINESS', 'PAYMENT', 'SECURITY', 'OTHER']),
  subject: z.string().min(5, 'Sujet trop court').max(200),
  description: z.string().min(10, 'Description trop courte').max(2000),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
});

function generateTicketNumber(): string {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `KSS-${dateStr}-${random}`;
}

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const tickets = await prisma.supportTicket.findMany({
      where: {
        userId: context.userId,
        ...(status ? { status: status as never } : {}),
      },
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return ok(tickets);
  } catch (error) {
    logApiError('/v1/support', error);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const body = await request.json();
    const parsed = createTicketSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const ticketNumber = generateTicketNumber();

    const ticket = await prisma.$transaction(async (tx) => {
      const newTicket = await tx.supportTicket.create({
        data: {
          ticketNumber,
          userId: context.userId,
          ...parsed.data,
        },
      });

      // Premier message automatique
      await tx.ticketMessage.create({
        data: {
          ticketId: newTicket.id,
          authorId: context.userId,
          content: parsed.data.description,
        },
      });

      return newTicket;
    });

    void recordAudit({
      userId: context.userId,
      action: 'support.ticket_created',
      entity: 'SupportTicket',
      entityId: ticket.id,
      metadata: { ticketNumber, category: parsed.data.category, priority: parsed.data.priority },
      request,
    });

    return created(
      {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        priority: ticket.priority,
      },
      `Ticket ${ticketNumber} créé. Notre équipe vous répondra dans les plus brefs délais.`
    );
  } catch (error) {
    logApiError('/v1/support', error);
    return serverError();
  }
}
