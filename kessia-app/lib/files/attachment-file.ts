// ============================================================
// KESSIA — Préparation d'un fichier de pièce jointe côté client (§46)
//
// Les images sont redimensionnées / recompressées avant envoi ; les
// PDF sont transmis tels quels. La validation de type et de taille
// finale est refaite côté serveur (`describeAttachment`).
// ============================================================

'use client';

const MAX_BYTES = 5 * 1024 * 1024; // doit rester ≤ MAX_ATTACHMENT_BYTES serveur
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];

export type PreparedAttachment = { fileName: string; dataUrl: string; thumbnail?: string };

/** Taille max acceptée pour une miniature (garde-fou aligné serveur). */
export const MAX_THUMB_BYTES = 60 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function drawScaled(img: HTMLImageElement, maxSize: number, quality: number): string | null {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Renvoie la version compressée + une miniature (~180 px) de l'image. */
function compressImage(file: File): Promise<{ dataUrl: string; thumbnail?: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide.'));
      img.onload = () => {
        const dataUrl = drawScaled(img, 1600, 0.82);
        if (!dataUrl) return reject(new Error('Canvas indisponible.'));
        const thumb = drawScaled(img, 180, 0.7) ?? undefined;
        resolve({
          dataUrl,
          thumbnail: thumb && thumb.length <= MAX_THUMB_BYTES ? thumb : undefined,
        });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Prépare un fichier pour l'envoi. Lève une Error avec un message
 *  lisible si le type n'est pas supporté ou si le fichier est trop lourd. */
export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  const type = (file.type || '').toLowerCase();

  if (type === 'application/pdf') {
    if (file.size > MAX_BYTES) throw new Error('PDF trop lourd (max 5 Mo).');
    return { fileName: file.name || 'document.pdf', dataUrl: await readAsDataUrl(file) };
  }

  if (IMAGE_TYPES.includes(type)) {
    const { dataUrl, thumbnail } = await compressImage(file);
    return { fileName: replaceExt(file.name || 'image', 'jpg'), dataUrl, thumbnail };
  }

  throw new Error('Type de fichier non autorisé (images et PDF uniquement).');
}

function replaceExt(name: string, ext: string): string {
  return name.replace(/\.[^.]+$/, '') + '.' + ext;
}

/** Libellé lisible d'une taille en octets. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
