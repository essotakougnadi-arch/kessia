// ============================================================
// KESSIA — Stockage des pièces KYC (cahier des charges §30)
//
// Les documents KYC ne restent en base (data-URI) que si Supabase
// Storage n'est pas configuré. Sinon : bucket privé + URL signées
// courtes, réservées à la conformité.
// ============================================================

import { storageConfigured, putObject, signObjectUrl, removeObjects } from './supabase-storage';

const BUCKET = process.env.SUPABASE_KYC_BUCKET || 'kyc-documents';

export function kycStorageEnabled(): boolean {
  return storageConfigured();
}

export const KYC_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/** PUR : extrait le type MIME et l'extension d'un data-URI image. */
export function dataUrlMeta(dataUrl: string): { mimeType: string; ext: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { mimeType: m[1], ext: KYC_EXT[m[1]] ?? 'bin' };
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { mimeType: m[1], bytes: Buffer.from(m[2], 'base64') };
}

export type StoredDoc = { storageKey: string; mimeType: string };

/** Téléverse une pièce KYC. Renvoie null si le stockage n'est pas
 *  disponible ou si l'upload échoue (l'appelant garde alors le data-URI). */
export async function storeKycDocument(
  userId: string,
  docId: string,
  dataUrl: string,
): Promise<StoredDoc | null> {
  if (!kycStorageEnabled()) return null;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  const ext = KYC_EXT[parsed.mimeType] ?? 'bin';
  const storageKey = `${userId}/${docId}.${ext}`;
  const ok = await putObject(BUCKET, storageKey, parsed.bytes, parsed.mimeType);
  return ok ? { storageKey, mimeType: parsed.mimeType } : null;
}

/** URL signée (5 min) pour afficher une pièce dans le back-office conformité. */
export async function kycDocumentUrl(storageKey: string): Promise<string | null> {
  return signObjectUrl(BUCKET, storageKey, 300);
}

/** Supprime des pièces du bucket (remplacement / retrait). Best-effort. */
export async function removeKycDocuments(storageKeys: Array<string | null>): Promise<void> {
  const keys = storageKeys.filter((k): k is string => !!k);
  await removeObjects(BUCKET, keys);
}
