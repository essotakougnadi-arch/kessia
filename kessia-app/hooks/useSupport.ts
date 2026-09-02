// ============================================================
// KESSIA — useSupport / useTicketThread Hooks
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend, type ApiResult } from '@/lib/api/client';
import type { TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';

export type SupportTicket = {
  id: string;
  ticketNumber: string;
  category: TicketCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
  messages: { id: string; content: string; authorId: string; createdAt: string }[];
};

export type TicketMessage = {
  id: string;
  ticketId: string;
  authorId: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
};

export type CreateTicketPayload = {
  category: TicketCategory;
  subject: string;
  description: string;
  priority?: TicketPriority;
};

export type TicketAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  isInternal: boolean;
  createdAt: string;
  uploadedByMe: boolean;
  thumbnail: string | null;
  url: string | null;
};

export type ActionResult = { success: boolean; message: string };

function toActionResult(r: ApiResult): ActionResult {
  return {
    success: r.success,
    message: r.message ?? r.error ?? (r.success ? 'Opération réussie.' : 'Une erreur est survenue.'),
  };
}

export function useSupport() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<SupportTicket[]>(
    accessToken ? ['/api/v1/support', accessToken] : null,
    ([url]: [string, string]) => apiGet<SupportTicket[]>(url),
    { revalidateOnFocus: false }
  );

  async function createTicket(payload: CreateTicketPayload): Promise<ActionResult> {
    const result = toActionResult(await apiSend('/api/v1/support', 'POST', payload));
    if (result.success) mutate();
    return result;
  }

  return {
    tickets: data ?? [],
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    createTicket,
  };
}

export function useTicketThread(ticketId: string | null) {
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<TicketMessage[]>(
    accessToken && ticketId ? [`/api/v1/support/${ticketId}/messages`, accessToken] : null,
    ([url]: [string, string]) => apiGet<TicketMessage[]>(url),
    { revalidateOnFocus: false }
  );

  async function reply(content: string): Promise<ActionResult> {
    if (!ticketId) return { success: false, message: 'Ticket introuvable.' };
    const result = toActionResult(
      await apiSend(`/api/v1/support/${ticketId}/messages`, 'POST', { content })
    );
    if (result.success) mutate();
    return result;
  }

  return {
    messages: data ?? [],
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    reply,
  };
}

export function useTicketAttachments(ticketId: string | null) {
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<TicketAttachment[]>(
    accessToken && ticketId ? [`/api/v1/support/${ticketId}/attachments`, accessToken] : null,
    ([url]: [string, string]) => apiGet<TicketAttachment[]>(url),
    { revalidateOnFocus: false }
  );

  async function upload(payload: { fileName: string; dataUrl: string; thumbnail?: string; isInternal?: boolean }): Promise<ActionResult> {
    if (!ticketId) return { success: false, message: 'Ticket introuvable.' };
    const result = toActionResult(
      await apiSend(`/api/v1/support/${ticketId}/attachments`, 'POST', payload)
    );
    if (result.success) mutate();
    return result;
  }

  async function remove(attachmentId: string): Promise<ActionResult> {
    if (!ticketId) return { success: false, message: 'Ticket introuvable.' };
    const result = toActionResult(
      await apiSend(`/api/v1/support/${ticketId}/attachments?attachmentId=${attachmentId}`, 'DELETE')
    );
    if (result.success) mutate();
    return result;
  }

  return {
    attachments: data ?? [],
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    upload,
    remove,
  };
}
