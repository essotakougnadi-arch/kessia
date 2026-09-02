import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { MiniPdf } from './mini-pdf';
import { renderInvoicePdf } from '@/lib/business/invoice-pdf';
import { renderReceiptPdf } from '@/lib/wallet/receipt-pdf';

function asString(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

describe('MiniPdf', () => {
  it('produit un PDF structurellement valide', () => {
    const pdf = new MiniPdf('Test');
    pdf.text('Bonjour le monde', { size: 12, bold: true });
    pdf.hr();
    pdf.keyValue('Clé', 'Valeur');
    const out = pdf.build();
    const s = asString(out);

    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/Type /Catalog');
    expect(s).toContain('/BaseFont /Helvetica');
    expect(s).toContain('xref');
    expect(s).toMatch(/trailer\s*<< \/Size \d+ \/Root 1 0 R >>/);
    expect(out.byteLength).toBeGreaterThan(400);
  });

  it('échappe les parenthèses et translittère les caractères non latin-1', () => {
    const pdf = new MiniPdf();
    pdf.text('Montant (net) : 12 500 — l’essentiel · €');
    const s = asString(pdf.build());
    // parenthèses échappées
    expect(s).toContain('\\(net\\)');
    // apostrophe typographique -> simple ; tiret cadratin -> '-'
    expect(s).toContain("l'essentiel");
    expect(s).not.toContain('—');
  });

  it('pagine quand le contenu déborde', () => {
    const pdf = new MiniPdf();
    for (let i = 0; i < 120; i++) pdf.text(`Ligne ${i} — lorem ipsum dolor sit amet`);
    const s = asString(pdf.build());
    const pageCount = (s.match(/\/Type \/Page\b/g) ?? []).length;
    expect(pageCount).toBeGreaterThanOrEqual(2);
    expect(s).toMatch(/\/Count [2-9]/);
  });
});

// ------------------------------------------------------------
// Analyse bas niveau : on relit le PDF octet par octet et on
// vérifie que la table xref, les offsets, les /Length de flux et
// le /Count des pages sont cohérents — c.-à-d. qu'un lecteur PDF
// réel (pdf.js, Acrobat, aperçu macOS) saura l'ouvrir.
// ------------------------------------------------------------
type ParsedPdf = {
  buf: Buffer;
  xrefOffset: number;
  entries: number[]; // index = numéro d'objet, valeur = offset ; entrée 0 = objet libre
  trailerSize: number;
};

function parsePdf(bytes: Uint8Array): ParsedPdf {
  const buf = Buffer.from(bytes);
  const s = buf.toString('latin1');

  const m = s.match(/startxref\s+(\d+)\s+%%EOF\s*$/);
  if (!m) throw new Error('startxref/%%EOF introuvable');
  const xrefOffset = Number(m[1]);

  // startxref doit pointer sur le mot-clé « xref »
  expect(buf.slice(xrefOffset, xrefOffset + 4).toString('latin1')).toBe('xref');

  const header = s.slice(xrefOffset).match(/^xref\n0 (\d+)\n/);
  if (!header) throw new Error('en-tête xref malformé');
  const count = Number(header[1]);
  const tableStart = xrefOffset + header[0].length;

  const entries: number[] = [];
  for (let i = 0; i < count; i++) {
    const line = buf.slice(tableStart + i * 20, tableStart + i * 20 + 20).toString('latin1');
    // chaque ligne xref fait exactement 20 octets : « nnnnnnnnnn ggggg k \n »
    expect(line).toMatch(/^\d{10} \d{5} [nf] \n$/);
    entries.push(Number(line.slice(0, 10)));
  }

  const trailer = s.slice(xrefOffset).match(/trailer\n<< \/Size (\d+) \/Root 1 0 R >>/);
  if (!trailer) throw new Error('trailer malformé');

  return { buf, xrefOffset, entries, trailerSize: Number(trailer[1]) };
}

describe('MiniPdf — intégrité binaire', () => {
  function makeSample(pages = 1): Uint8Array {
    const pdf = new MiniPdf('Échantillon');
    pdf.text('Titre du document', { size: 16, bold: true, gap: 6 });
    pdf.hr();
    pdf.keyValue('Référence', 'DOC-2026-0001');
    pdf.keyValue('Montant', '41 300 FCFA', { bold: true });
    pdf.tableRow(
      [
        { text: 'Désignation', width: 0.6 },
        { text: 'Qté', width: 0.15, align: 'right' },
        { text: 'Total', width: 0.25, align: 'right' },
      ],
      { header: true }
    );
    pdf.tableRow([
      { text: 'Prestation (parenthèses) & accents é à ù', width: 0.6 },
      { text: '2', width: 0.15, align: 'right' },
      { text: '30 000', width: 0.25, align: 'right' },
    ]);
    for (let i = 0; i < 60 * (pages - 1); i++) pdf.text(`Ligne de remplissage ${i}`);
    return pdf.build();
  }

  it('chaque offset xref pointe vers « N 0 obj »', () => {
    const bytes = makeSample();
    const { buf, entries } = parsePdf(bytes);
    expect(entries[0]).toBe(0); // objet libre
    for (let n = 1; n < entries.length; n++) {
      const at = buf.slice(entries[n], entries[n] + 24).toString('latin1');
      expect(at.startsWith(`${n} 0 obj`)).toBe(true);
    }
  });

  it('trailer /Size == nombre d’entrées xref', () => {
    const { entries, trailerSize } = parsePdf(makeSample());
    expect(trailerSize).toBe(entries.length);
  });

  it('objet 1 est le Catalog et référence /Pages 2 0 R', () => {
    const { buf, entries } = parsePdf(makeSample());
    const obj1 = buf.slice(entries[1], entries[1] + 80).toString('latin1');
    expect(obj1).toContain('/Type /Catalog');
    expect(obj1).toContain('/Pages 2 0 R');
  });

  it('/Length de chaque flux de contenu == taille réelle du flux', () => {
    const s = Buffer.from(makeSample(3)).toString('latin1');
    const re = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g;
    let match: RegExpExecArray | null;
    let streams = 0;
    while ((match = re.exec(s)) !== null) {
      streams++;
      const declared = Number(match[1]);
      const actual = Buffer.byteLength(match[2], 'latin1');
      expect(actual).toBe(declared);
    }
    expect(streams).toBeGreaterThanOrEqual(3);
  });

  it('/Count de l’objet Pages == nombre réel d’objets Page', () => {
    const s = Buffer.from(makeSample(3)).toString('latin1');
    const count = Number(s.match(/\/Type \/Pages \/Kids \[([^\]]*)\] \/Count (\d+)/)![2]);
    const kids = s.match(/\/Type \/Pages \/Kids \[([^\]]*)\]/)![1].trim().split(/\s+R\s*/).filter(Boolean).length;
    const pageObjs = (s.match(/\/Type \/Page /g) ?? []).length;
    expect(count).toBe(3);
    expect(kids).toBe(3);
    expect(pageObjs).toBe(3);
  });

  it('un lecteur PDF conforme (pdf-lib) ouvre et re-sérialise le document', async () => {
    const doc = await PDFDocument.load(makeSample(3), { throwOnInvalidObject: true });
    const pages = doc.getPages();
    expect(pages).toHaveLength(3);
    expect(pages[0].getWidth()).toBeCloseTo(595.28, 1);
    expect(pages[0].getHeight()).toBeCloseTo(841.89, 1);
    // save() reconstruit tout le graphe d'objets : échoue sur un xref
    // ou un flux corrompu.
    await expect(doc.save()).resolves.toBeInstanceOf(Uint8Array);
  });

  it('pdf-lib ouvre aussi la facture et le reçu métier', async () => {
    const invoice = renderInvoicePdf({
      id: 'inv1', kind: 'INVOICE', number: 'FAC-2026-0007', status: 'SENT',
      issuedAt: new Date('2026-08-01'), dueDate: new Date('2026-08-31'),
      customerName: 'Ama Dossou', customerEmail: 'ama@example.com',
      items: [{ label: 'Conseil', quantity: 2, unitPrice: 15000 }],
      subtotal: 30000, tax: 5400, total: 35400,
      business: { name: 'Atelier Kossi', sector: 'Électronique', city: 'Lomé', phone: '+228 90 00 00 01', owner: 'Kossi Amétépé', email: 'kossi@example.com' },
    });
    const receipt = renderReceiptPdf({
      id: 'e1', reference: 'TRF-1788-ABCDEF', type: 'TRANSFER_OUT', direction: 'DEBIT',
      status: 'COMPLETED', amount: 12000, balanceAfter: 38000, currency: 'XOF',
      description: 'Transfert vers Adjoa', createdAt: new Date('2026-08-15T10:00:00Z'),
      processedAt: new Date('2026-08-15T10:00:01Z'), account: { name: 'Kossi Amétépé', phone: '+22890000001' },
    });
    for (const bytes of [invoice, receipt]) {
      const doc = await PDFDocument.load(bytes, { throwOnInvalidObject: true });
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
      await expect(doc.save()).resolves.toBeInstanceOf(Uint8Array);
    }
  });

  it('les rendus métier sont eux aussi binairement cohérents', () => {
    const invoice = renderInvoicePdf({
      id: 'inv1', kind: 'INVOICE', number: 'FAC-2026-0007', status: 'SENT',
      issuedAt: new Date('2026-08-01'), dueDate: new Date('2026-08-31'),
      customerName: 'Ama Dossou', customerEmail: 'ama@example.com',
      items: [{ label: 'Conseil', quantity: 2, unitPrice: 15000 }],
      subtotal: 30000, tax: 5400, total: 35400,
      business: { name: 'Atelier Kossi', sector: 'Électronique', city: 'Lomé', phone: '+228 90 00 00 01', owner: 'Kossi Amétépé', email: 'kossi@example.com' },
    });
    const { buf, entries, trailerSize } = parsePdf(invoice);
    expect(trailerSize).toBe(entries.length);
    for (let n = 1; n < entries.length; n++) {
      expect(buf.slice(entries[n], entries[n] + 12).toString('latin1').startsWith(`${n} 0 obj`)).toBe(true);
    }
  });
});

describe('rendus métier', () => {
  it('renderInvoicePdf produit un PDF', () => {
    const bytes = renderInvoicePdf({
      id: 'inv1',
      kind: 'INVOICE',
      number: 'FAC-2026-0007',
      status: 'SENT',
      issuedAt: new Date('2026-08-01'),
      dueDate: new Date('2026-08-31'),
      customerName: 'Ama Dossou',
      customerEmail: 'ama@example.com',
      items: [
        { label: 'Prestation de conseil', quantity: 2, unitPrice: 15000 },
        { name: 'Déplacement', quantity: 1, unitPrice: 5000, total: 5000 },
      ],
      subtotal: 35000,
      tax: 6300,
      total: 41300,
      business: { name: 'Atelier Kossi', sector: 'Électronique', city: 'Lomé', phone: '+228 90 00 00 01', owner: 'Kossi Amétépé', email: 'kossi@example.com' },
    });
    const s = asString(bytes);
    expect(s.startsWith('%PDF')).toBe(true);
    expect(s).toContain('FAC-2026-0007');
    expect(bytes.byteLength).toBeGreaterThan(800);
  });

  it('renderReceiptPdf produit un PDF', () => {
    const bytes = renderReceiptPdf({
      id: 'e1',
      reference: 'TRF-1788-ABCDEF',
      type: 'TRANSFER_OUT',
      direction: 'DEBIT',
      status: 'COMPLETED',
      amount: 12000,
      balanceAfter: 38000,
      currency: 'XOF',
      description: 'Transfert vers Adjoa',
      createdAt: new Date('2026-08-15T10:00:00Z'),
      processedAt: new Date('2026-08-15T10:00:01Z'),
      account: { name: 'Kossi Amétépé', phone: '+22890000001' },
    });
    const s = asString(bytes);
    expect(s.startsWith('%PDF')).toBe(true);
    expect(s).toContain('TRF-1788-ABCDEF');
  });
});
