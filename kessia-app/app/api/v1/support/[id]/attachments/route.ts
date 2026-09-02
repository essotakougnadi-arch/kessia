// ============================================================
// KESSIA — GET/POST/DELETE /api/v1/support/[id]/attachments (§46)
// Pièces jointes d'un ticket : capture d'écran, justificatif…
// Accès : demandeur du ticket ou agent (assigné / rôle support).
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, created, badRequest, notFound, forbidden, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';
import {
  describeAttachment,
  sanitizeThumbnail,
  ticketStorageEnabled,
  storeTicketAttachment,
  ticketAttachmentUrl,
  removeTicketAttachments,
  MAX_ATTACHMENTS_PER_TICKET,
} from '@/lib/storage/ticket-storage';

export const dynamic = 'force-dynamic';

const STAFF_ROLES = ['ADMIN', 'SUPER_ADMIN', 'SUPPORT'];

const uploadSchema = z.object({
  fileName: z.string().min(1).max(160),
  dataUrl: z.string().max(7_500_000, 'Fichier trop lourd (max ~5 Mo).'),
  thumbnail: z.string().max(90_000).optional(),
  isInternal: z.boolean().optional(),
});

async function resolveAccess(ticketId: string, userId: string, role: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, userId: true, assignedToId: true, status: true },
  });
  if (!ticket) return { ticket: null, isStaff: false, canAccess: false };
  const isStaff = ticket.assignedToId === userId || STAFF_ROLES.includes(role);
  const canAccess = ticket.userId === userId || isStaff;
  return { ticket, isStaff, canAccess };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const { ticket, isStaff, canAccess } = await resolveAccess(params.id, context.userId, context.role);
    if (!ticket) return notFound('Ticket introuvable.');
    if (!canAccess) return forbidden();

    const rows = await prisma.ticketAttachment.findMany({
      where: { ticketId: params.id, ...(isStaff ? {} : { isInternal: false }) },
      orderBy: { createdAt: 'asc' },
    });

    const items = await Promise.all(
      rows.map(async (a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        isInternal: a.isInternal,
        createdAt: a.createdAt,
        uploadedByMe: a.uploadedById === context.userId,
        thumbnail: a.thumbnail,
        url: a.storageKey ? await ticketAttachmentUrl(a.storageKey) : a.dataUrl,
      }))
    );

    return ok(items);
  } catch (e) {
    logApiError('/v1/support/[id]/attachments', e);
    return serverError();
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'support.attachment', {
      limit: 15, windowMs: 10 * 60_000, by: context.userId,
    });
    if (limited) return limited;

    const { ticket, isStaff, canAccess } = await resolveAccess(params.id, context.userId, context.role);
    if (!ticket) return notFound('Ticket introuvable.');
    if (!canAccess) return forbidden();
    if (ticket.status === 'CLOSED') return badRequest('Ce ticket est fermé.');

    const parsed = uploadSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { fileName, dataUrl } = parsed.data;
    const isInternal = isStaff ? parsed.data.isInternal ?? false : false;

    const check = describeAttachment(dataUrl);
    if (!check.ok) return badRequest(check.reason);
    const thumbnail = check.info.mimeType.startsWith('image/')
      ? sanitizeThumbnail(parsed.data.thumbnail)
      : null;

    const count = await prisma.ticketAttachment.count({ where: { ticketId: params.id } });
    if (count >= MAX_ATTACHMENTS_PER_TICKET) {
      return badRequest(`Maximum ${MAX_ATTACHMENTS_PER_TICKET} pièces jointes par ticket.`);
    }

    const useStorage = ticketStorageEnabled();
    const row = await prisma.ticketAttachment.create({
      data: {
        ticketId: params.id,
        uploadedById: context.userId,
        fileName: fileName.trim(),
        mimeType: check.info.mimeType,
        size: check.info.size,
        isInternal,
        thumbnail,
        dataUrl: useStorage ? null : dataUrl,
      },
    });

    if (useStorage) {
      const stored = await storeTicketAttachment(params.id, row.id, dataUrl);
      if (stored) {
        await prisma.ticketAttachment.update({
          where: { id: row.id },
          data: { storageKey: stored.storageKey },
        });
      } else {
        // upload impossible → repli data-URI pour ne pas perdre le fichier
        await prisma.ticketAttachment.update({ where: { id: row.id }, data: { dataUrl } });
      }
    }

    // Réponse d'un demandeur en attente → le ticket repart en traitement.
    if (!isStaff && ticket.userId === context.userId && ticket.status === 'WAITING') {
      await prisma.supportTicket.update({ where: { id: params.id }, data: { status: 'IN_PROGRESS' } });
    }

    void recordAudit({
      userId: context.userId,
      action: 'support.attachment_added',
      entity: 'SupportTicket',
      entityId: params.id,
      // ⚠️ ne jamais journaliser le contenu du fichier
      metadata: { attachmentId: row.id, mimeType: check.info.mimeType, size: check.info.size, isInternal },
      request,
    });

    return created(
      { id: row.id, fileName: row.fileName, mimeType: row.mimeType, size: row.size, isInternal },
      'Pièce jointe ajoutée.'
    );
  } catch (e) {
    logApiError('/v1/support/[id]/attachments', e);
    return serverError();
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const attachmentId = new URL(request.url).searchParams.get('attachmentId');
    if (!attachmentId) return badRequest('Identifiant de pièce jointe requis.');

    const { ticket, isStaff, canAccess } = await resolveAccess(params.id, context.userId, context.role);
    if (!ticket) return notFound('Ticket introuvable.');
    if (!canAccess) return forbidden();

    const att = await prisma.ticketAttachment.findFirst({
      where: { id: attachmentId, ticketId: params.id },
      select: { id: true, uploadedById: true, storageKey: true },
    });
    if (!att) return notFound('Pièce jointe introuvable.');
    if (!isStaff && att.uploadedById !== context.userId) return forbidden();

    await prisma.ticketAttachment.delete({ where: { id: att.id } });
    void removeTicketAttachments([att.storageKey]);

    void recordAudit({
      userId: context.userId,
      action: 'support.attachment_removed',
      entity: 'SupportTicket',
      entityId: params.id,
      metadata: { attachmentId: att.id },
      request,
    });

    return ok(null, 'Pièce jointe retirée.');
  } catch (e) {
    logApiError('/v1/support/[id]/attachments', e);
    return serverError();
  }
}
