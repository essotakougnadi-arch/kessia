// ============================================================
// KESSIA — Générateur PDF minimal (§7)
//
// Aucune dépendance, aucun navigateur headless : produit un PDF A4
// texte (polices standard Helvetica / Helvetica-Bold, non intégrées)
// pour les devis, factures et reçus. Suffisant pour des documents
// simples ; fonctionne à l'identique en dev, `next build` et serverless.
// ============================================================

const PAGE_W = 595.28; // A4 en points (72 dpi)
const PAGE_H = 841.89;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Largeurs Helvetica (WinAnsi) pour les codes 32..126, en 1/1000 em.
// prettier-ignore
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
// prettier-ignore
const HELV_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function charWidth(code: number, bold: boolean): number {
  if (code < 32 || code > 126) return (bold ? HELV_B : HELV)[0] / 1000;
  return (bold ? HELV_B : HELV)[code - 32] / 1000;
}

function textWidth(s: string, size: number, bold: boolean): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += charWidth(s.charCodeAt(i), bold);
  return w * size;
}

/** Coupe le texte pour tenir dans `maxWidth` (points). */
function wrap(s: string, size: number, bold: boolean, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of s.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, bold) <= maxWidth || !line) line = candidate;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

function pdfEscape(s: string): string {
  // WinAnsi : on translittère les caractères hors ASCII courants.
  return s
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[€]/g, 'EUR')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\xFF]/g, '?');
}

type Align = 'left' | 'right';

export class MiniPdf {
  private pages: string[] = [];
  private ops: string[] = [];
  private y = PAGE_H - MARGIN;
  private title = 'Document';

  constructor(title?: string) {
    if (title) this.title = title;
  }

  private ensureSpace(h: number) {
    if (this.y - h < MARGIN) this.pageBreak();
  }

  pageBreak() {
    this.pages.push(this.ops.join('\n'));
    this.ops = [];
    this.y = PAGE_H - MARGIN;
  }

  moveDown(pts = 12) {
    this.y -= pts;
    return this;
  }

  hr(pts = 8) {
    this.ensureSpace(pts + 2);
    this.y -= pts;
    this.ops.push(`0.8 w 0.75 0.72 0.66 RG ${MARGIN} ${this.y.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${this.y.toFixed(2)} l S`);
    this.y -= 2;
    return this;
  }

  /** Un bloc de texte, éventuellement enveloppé. */
  text(
    content: string,
    opts: { size?: number; bold?: boolean; align?: Align; color?: [number, number, number]; gap?: number } = {}
  ) {
    const size = opts.size ?? 10;
    const bold = opts.bold ?? false;
    const lead = size * 1.35;
    const [r, g, b] = opts.color ?? [0.1, 0.09, 0.06];
    const font = bold ? '/F2' : '/F1';
    for (const line of wrap(content, size, bold, CONTENT_W)) {
      this.ensureSpace(lead);
      this.y -= lead;
      const w = textWidth(line, size, bold);
      const x = opts.align === 'right' ? PAGE_W - MARGIN - w : MARGIN;
      this.ops.push(
        `BT ${r} ${g} ${b} rg ${font} ${size} Tf ${x.toFixed(2)} ${this.y.toFixed(2)} Td (${pdfEscape(line)}) Tj ET`
      );
    }
    if (opts.gap) this.y -= opts.gap;
    return this;
  }

  /** Deux colonnes : libellé à gauche, valeur alignée à droite. */
  keyValue(key: string, value: string, opts: { bold?: boolean; size?: number } = {}) {
    const size = opts.size ?? 10;
    const lead = size * 1.5;
    this.ensureSpace(lead);
    this.y -= lead;
    const vw = textWidth(value, size, opts.bold ?? false);
    this.ops.push(
      `BT 0.1 0.09 0.06 rg /F1 ${size} Tf ${MARGIN} ${this.y.toFixed(2)} Td (${pdfEscape(key)}) Tj ET`
    );
    this.ops.push(
      `BT 0.1 0.09 0.06 rg ${opts.bold ? '/F2' : '/F1'} ${size} Tf ${(PAGE_W - MARGIN - vw).toFixed(2)} ${this.y.toFixed(2)} Td (${pdfEscape(value)}) Tj ET`
    );
    return this;
  }

  /** Ligne de tableau. `cols` = { text, width (fraction), align }. */
  tableRow(
    cols: Array<{ text: string; width: number; align?: Align; bold?: boolean }>,
    opts: { size?: number; header?: boolean } = {}
  ) {
    const size = opts.size ?? 9.5;
    const lead = size * 1.7;
    this.ensureSpace(lead);
    this.y -= lead;
    if (opts.header) {
      this.ops.push(`0.96 0.94 0.88 rg ${MARGIN} ${(this.y - 4).toFixed(2)} ${CONTENT_W} ${(lead).toFixed(2)} re f`);
    }
    let x = MARGIN;
    for (const c of cols) {
      const colW = CONTENT_W * c.width;
      const bold = c.bold ?? opts.header ?? false;
      const first = wrap(c.text, size, bold, colW - 6)[0] ?? '';
      const tw = textWidth(first, size, bold);
      const tx = c.align === 'right' ? x + colW - tw - 3 : x + 3;
      this.ops.push(
        `BT 0.1 0.09 0.06 rg ${bold ? '/F2' : '/F1'} ${size} Tf ${tx.toFixed(2)} ${this.y.toFixed(2)} Td (${pdfEscape(first)}) Tj ET`
      );
      x += colW;
    }
    return this;
  }

  build(): Uint8Array {
    this.pages.push(this.ops.join('\n'));

    const objects: string[] = [];
    // 1 Catalog, 2 Pages, 3 F1, 4 F2, puis N*(Page, Content)
    const pageObjNums: number[] = [];
    let n = 4;
    for (let i = 0; i < this.pages.length; i++) {
      const contentNum = ++n;
      const pageNum = ++n;
      pageObjNums.push(pageNum);
      const stream = this.pages[i];
      objects[contentNum] = `${contentNum} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream\nendobj\n`;
      objects[pageNum] =
        `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`;
    }

    objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
    objects[2] =
      `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((p) => `${p} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>\nendobj\n`;
    objects[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;
    objects[4] = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`;

    let pdf = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;
    const offsets: number[] = [];
    for (let i = 1; i <= n; i++) {
      offsets[i] = Buffer.byteLength(pdf, 'latin1');
      pdf += objects[i];
    }
    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${n + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= n; i++) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${n + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'latin1');
  }
}
