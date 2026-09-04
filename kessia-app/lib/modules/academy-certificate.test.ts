import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderCertificatePdf, certificateFileName } from './academy-certificate';
import { COURSES } from './academy-data';

function asString(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

describe('renderCertificatePdf', () => {
  const course = COURSES[0];

  it('produit un PDF valide (relu par pdf-lib) contenant le nom du membre et le titre du cours', async () => {
    const bytes = renderCertificatePdf(course, { name: 'Ama Dossou' });
    const s = asString(bytes);

    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s).toContain('Ama Dossou');
    // Les apostrophes typographiques du titre sont translittérées par MiniPdf.
    expect(s).toContain(course.title.replace(/[’]/g, "'"));
    expect(s).toContain('KESSIA ACADEMY');
    expect(s).toContain('monstration'); // "démonstration" (accent conservé en Latin-1 par MiniPdf)

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 0);
    expect(height).toBeCloseTo(841.89, 0);
  });

  it('nomme le fichier à partir de l’identifiant du cours', () => {
    expect(certificateFileName(course)).toBe(`certificat-kessia-${course.id}.pdf`);
  });
});
