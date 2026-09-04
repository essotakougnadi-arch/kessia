// ============================================================
// KESSIA Academy — certificat de fin de cours (§10, ADR 0041 item 5)
// La progression et la fin de cours sont SIMULÉES (aucune table de
// suivi de cours) : le certificat est généré à la volée, à partir du
// nom du membre + d'un cours du catalogue statique, sans rien
// persister. Il le dit explicitement — ce n'est pas une certification
// professionnelle réelle tant qu'Academy n'est pas ouverte.
// ============================================================

import { MiniPdf } from '@/lib/pdf/mini-pdf';
import { formatDate } from '@/lib/utils/format';
import type { Course } from './academy-data';

export type CertificateHolder = { name: string };

export function certificateFileName(course: Course): string {
  return `certificat-kessia-${course.id}.pdf`;
}

export function renderCertificatePdf(course: Course, holder: CertificateHolder): Uint8Array {
  const pdf = new MiniPdf(`Certificat — ${course.title}`);

  pdf.text('KESSIA ACADEMY', { size: 18, bold: true });
  pdf.text('Certificat de réussite (aperçu de démonstration)', { size: 9.5, color: [0.42, 0.38, 0.32], gap: 10 });
  pdf.hr();
  pdf.moveDown(18);

  pdf.text('Décerné à', { size: 10, color: [0.42, 0.38, 0.32] });
  pdf.text(holder.name, { size: 22, bold: true, gap: 4 });
  pdf.moveDown(14);

  pdf.text('Pour avoir complété le cours', { size: 10, color: [0.42, 0.38, 0.32] });
  pdf.text(course.title, { size: 15, bold: true, gap: 2 });
  pdf.text(course.summary, { size: 9.5, color: [0.35, 0.31, 0.26], gap: 6 });
  pdf.moveDown(14);

  pdf.keyValue('Catégorie', course.category);
  pdf.keyValue('Niveau', course.level);
  pdf.keyValue('Durée du cours', course.duration);
  pdf.keyValue('Formateur', course.instructor);
  pdf.keyValue('Délivré le', formatDate(new Date()), { bold: true });
  pdf.moveDown(24);

  pdf.hr();
  pdf.text(
    'Ce certificat atteste d’une progression simulée dans l’aperçu de démonstration de KESSIA Academy. ' +
      'Il ne constitue pas, à ce stade, une certification professionnelle reconnue — les cours, formateurs et ' +
      'évaluations réels arriveront avec le lancement du module et nos partenaires formateurs.',
    { size: 8, color: [0.5, 0.46, 0.4] }
  );
  pdf.text('KESSIA Academy · kessia.app', { size: 8, color: [0.5, 0.46, 0.4] });

  return pdf.build();
}
