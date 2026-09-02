// ============================================================
// KESSIA — GET/PATCH /api/v1/admin/support/[id]  (§45)
// Traitement d'un ticket par un agent : consultation du fil,
// affectation, changement de statut, réponse.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin, SUPPORT_ROLES } from '@/lib/auth/admin';
import prisma from '@/lib/db/prisma';
import { recordAudit } from '@/lib/audit/audit.service';
import { notify } from '@/lib/notifications/notify';
import { ok, badRequest, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign'), assigneeId: z.string().optional() }),
  z.object({ action: z.literal('unassign') }),
  z.object({ action: z.literal('status'), status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED']) }),
  z.object({ action: z.literal('reply'), content: z.string().min(1).max(2000), internal: z.boolean().optional() }),
]);

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireAdmin(request, SUPPORT_ROLES);
    if (error) return error;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) return notFound('Ticket introuvable.');

    return ok(ticket);
  } catch (e) {
    logApiError('/v1/admin/support/[id]', e);
    return serverError();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await requireAdmin(request, SUPPORT_ROLES);
    if (error || !context) return error ?? serverError();

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true, status: true, ticketNumber: true, subject: true, assignedToId: true },
    });
    if (!ticket) return notFound('Ticket introuvable.');

    // ── Affectation ──
    if (input.action === 'assign') {
      const assigneeId = input.assigneeId ?? context.userId;
      const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, firstName: true } });
      if (!assignee) return badRequest('Agent introuvable.');
      const updated = await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          assignedToId: assigneeId,
          status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status,
        },
        select: { status: true, assignedToId: true },
      });
      void recordAudit({
        userId: context.userId, action: 'admin.ticket_assign', entity: 'SupportTicket', entityId: ticket.id,
        metadata: { assigneeId }, request,
      });
      return ok(updated, 'Ticket affecté.');
    }

    if (input.action === 'unassign') {
      const updated = await prisma.supportTicket.update({
        where: { id: ticket.id }, data: { assignedToId: null }, select: { status: true, assignedToId: true },
      });
      void recordAudit({
        userId: context.userId, action: 'admin.ticket_unassign', entity: 'SupportTicket', entityId: ticket.id, request,
      });
      return ok(updated, 'Affectation retirée.');
    }

    // ── Changement de statut ──
    if (input.action === 'status') {
      const updated = await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: input.status,
          ...(input.status === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
          ...(input.status === 'CLOSED' ? { closedAt: new Date() } : {}),
        },
        select: { status: true },
      });
      void recordAudit({
        userId: context.userId, action: 'admin.ticket_status', entity: 'SupportTicket', entityId: ticket.id,
        metadata: { status: input.status }, request,
      });
      if (input.status === 'RESOLVED' || input.status === 'CLOSED') {
        void notify({
          userId: ticket.userId, category: 'SUPPORT', priority: 'NORMAL',
          title: input.status === 'RESOLVED' ? 'Ticket résolu' : 'Ticket fermé',
          body: `Votre ticket ${ticket.ticketNumber} « ${ticket.subject} » a été ${input.status === 'RESOLVED' ? 'marqué comme résolu' : 'fermé'}.`,
          actionUrl: `/support/${ticket.id}`,
        });
      }
      return ok(updated, 'Statut mis à jour.');
    }

    // ── Réponse d'agent ──
    if (ticket.status === 'CLOSED') return badRequest('Ce ticket est fermé.');

    const message = await prisma.$transaction(async (tx) => {
      const m = await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorId: context.userId,
          content: input.content,
          isInternal: input.internal ?? false,
        },
      });
      if (!input.internal) {
        await tx.supportTicket.update({
          where: { id: ticket.id },
          data: {
            status: 'WAITING',
            assignedToId: ticket.assignedToId ?? context.userId,
          },
        });
      }
      return m;
    });

    void recordAudit({
      userId: context.userId, action: 'admin.ticket_reply', entity: 'SupportTicket', entityId: ticket.id,
      metadata: { internal: input.internal ?? false }, request,
    });

    if (!input.internal) {
      void notify({
        userId: ticket.userId, category: 'SUPPORT', priority: 'NORMAL',
        title: 'Réponse du support',
        body: `Un agent a répondu à votre ticket ${ticket.ticketNumber} « ${ticket.subject} ».`,
        actionUrl: `/support/${ticket.id}`,
      });
    }

    return ok(message, input.internal ? 'Note interne ajoutée.' : 'Réponse envoyée.');
  } catch (e) {
    logApiError('/v1/admin/support/[id]', e);
    return serverError();
  }
}
