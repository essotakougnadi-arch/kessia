// ============================================================
// KESSIA — Pièces jointes de ticket support (§46)
//
// Même principe que les pièces KYC (ADR 0003 / 0014) : bucket privé
// Supabase + URL signées courtes si configuré, repli data-URI en
// base sinon. Types acceptés : images courantes et PDF.
// ============================================================

import { storageConfigured, putObject, signObjectUrl, removeObjects } from './supabase-storage';

const BUCKET = process.env.SUPABASE_TICKET_BUCKET || 'ticket-attachments';

/** Taille max d'une pièce jointe, en octets (fichier décodé). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 Mo
/** Nombre max de pièces jointes par ticket. */
export const MAX_ATTACHMENTS_PER_TICKET = 10;
/** Taille max d'une miniature acceptée (data-URI). */
export const MAX_THUMBNAIL_BYTES = 60 * 1024;

export const ATTACHMENT_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export function ticketStorageEnabled(): boolean {
  return storageConfigured();
}

export type AttachmentInfo = { mimeType: string; ext: string; size: number };

/**
 * PUR : valide un data-URI de pièce jointe et en décrit le contenu.
 * Renvoie `{ ok: false, reason }` si le format, le type MIME ou la
 * taille ne conviennent pas. Testé (`ticket-storage.test.ts`).
 */
export function describeAttachment(
  dataUrl: string,
): { ok: true; info: AttachmentInfo } | { ok: false; reason: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { ok: false, reason: 'Format de fichier non reconnu.' };
  const mimeType = m[1].toLowerCase();
  if (!(mimeType in ATTACHMENT_EXT)) {
    return { ok: false, reason: 'Type de fichier non autorisé (images et PDF uniquement).' };
  }
  // Taille du binaire décodé à partir de la longueur base64.
  const b64 = m[2];
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const size = Math.floor((b64.length * 3) / 4) - padding;
  if (size <= 0) return { ok: false, reason: 'Fichier vide.' };
  if (size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: 'Fichier trop lourd (max 5 Mo).' };
  }
  return { ok: true, info: { mimeType, ext: ATTACHMENT_EXT[mimeType], size } };
}

/**
 * PUR : valide une miniature fournie par le client. On n'accepte qu'un
 * petit JPEG/PNG/WebP en data-URI ; toute autre chose est ignorée
 * (retourne null). Testé (`ticket-storage.test.ts`).
 */
export function sanitizeThumbnail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  if (value.length > MAX_THUMBNAIL_BYTES) return null;
  const b64 = m[2];
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const size = Math.floor((b64.length * 3) / 4) - padding;
  if (size <= 0 || size > MAX_THUMBNAIL_BYTES) return null;
  return value;
}

function decodeDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { mimeType: m[1].toLowerCase(), bytes: Buffer.from(m[2], 'base64') };
}

export type StoredAttachment = { storageKey: string; mimeType: string; size: number };

/** Téléverse une pièce jointe. Renvoie null si le stockage objet n'est
 *  pas disponible ou si l'upload échoue (l'appelant garde le data-URI). */
export async function storeTicketAttachment(
  ticketId: string,
  attachmentId: string,
  dataUrl: string,
): Promise<StoredAttachment | null> {
  if (!ticketStorageEnabled()) return null;
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  const ext = ATTACHMENT_EXT[decoded.mimeType] ?? 'bin';
  const storageKey = `${ticketId}/${attachmentId}.${ext}`;
  const uploaded = await putObject(BUCKET, storageKey, decoded.bytes, decoded.mimeType);
  return uploaded
    ? { storageKey, mimeType: decoded.mimeType, size: decoded.bytes.length }
    : null;
}

/** URL signée (5 min) pour télécharger une pièce jointe. */
export async function ticketAttachmentUrl(storageKey: string): Promise<string | null> {
  return signObjectUrl(BUCKET, storageKey, 300);
}

/** Supprime des pièces jointes du bucket. Best-effort. */
export async function removeTicketAttachments(storageKeys: Array<string | null>): Promise<void> {
  const keys = storageKeys.filter((k): k is string => !!k);
  await removeObjects(BUCKET, keys);
}
