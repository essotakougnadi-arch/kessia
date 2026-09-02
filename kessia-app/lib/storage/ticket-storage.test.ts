import { describe, it, expect } from 'vitest';
import { describeAttachment, sanitizeThumbnail, MAX_ATTACHMENT_BYTES, MAX_THUMBNAIL_BYTES } from './ticket-storage';

// petit PNG 1×1 transparent
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function dataUrlOfSize(mime: string, bytes: number): string {
  // base64 d'une longueur qui décode ~bytes octets
  const b64 = 'A'.repeat(Math.ceil((bytes * 4) / 3));
  return `data:${mime};base64,${b64}`;
}

describe('describeAttachment', () => {
  it('accepte un PNG valide', () => {
    const r = describeAttachment(PNG_1PX);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.info.mimeType).toBe('image/png');
      expect(r.info.ext).toBe('png');
      expect(r.info.size).toBeGreaterThan(0);
    }
  });

  it('accepte un PDF', () => {
    const r = describeAttachment('data:application/pdf;base64,JVBERi0xLjQK');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.info.ext).toBe('pdf');
  });

  it('refuse un type non autorisé', () => {
    const r = describeAttachment('data:text/html;base64,PGgxPmhpPC9oMT4=');
    expect(r.ok).toBe(false);
  });

  it('refuse une chaîne qui n’est pas un data-URI base64', () => {
    expect(describeAttachment('https://example.com/x.png').ok).toBe(false);
    expect(describeAttachment('').ok).toBe(false);
  });

  it('refuse un fichier au-dessus de la limite', () => {
    const r = describeAttachment(dataUrlOfSize('image/jpeg', MAX_ATTACHMENT_BYTES + 1024));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/lourd/i);
  });
});

describe('sanitizeThumbnail', () => {
  it('accepte une petite miniature JPEG', () => {
    const thumb = `data:image/jpeg;base64,${'A'.repeat(400)}`;
    expect(sanitizeThumbnail(thumb)).toBe(thumb);
  });

  it('refuse un PDF, une URL, du non-string', () => {
    expect(sanitizeThumbnail('data:application/pdf;base64,JVBERi0xLjQK')).toBeNull();
    expect(sanitizeThumbnail('https://x/y.jpg')).toBeNull();
    expect(sanitizeThumbnail(null)).toBeNull();
    expect(sanitizeThumbnail(42)).toBeNull();
  });

  it('refuse une miniature trop lourde', () => {
    const big = `data:image/jpeg;base64,${'A'.repeat(MAX_THUMBNAIL_BYTES + 10)}`;
    expect(sanitizeThumbnail(big)).toBeNull();
  });
});
