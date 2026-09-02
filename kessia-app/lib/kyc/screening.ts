// ============================================================
// KESSIA — Screening sanctions / PPE (cahier des charges §30, §59)
//
// ⚠️ STUB LOCAL. Le screening réel (listes ONU / UE / OFAC, PPE)
// exige un prestataire habilité et une base à jour — voir
// docs/compliance/matrix.md. Ici : une liste locale de test qui
// pose un DRAPEAU pour la revue humaine, jamais un blocage auto.
// ============================================================

// Liste de démonstration (aucune personne réelle). En production,
// remplacée par l'API du prestataire de screening.
const DEMO_WATCHLIST: Array<{ name: string; list: string; reason: string }> = [
  { name: 'john doe', list: 'DEMO-SANCTIONS', reason: 'Entrée de démonstration — ne correspond à personne réel.' },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ScreeningHit = { name: string; list: string; reason: string };

export type ScreeningResult = {
  provider: 'DEMO_LOCAL';
  checkedAt: string;
  clear: boolean;
  hits: ScreeningHit[];
  note: string;
};

/** Compare un nom complet à la liste de surveillance locale. Ne bloque rien. */
export function screenName(fullName: string): ScreeningResult {
  const target = normalize(fullName);
  const hits = DEMO_WATCHLIST.filter((e) => {
    const n = normalize(e.name);
    return target === n || target.includes(n) || n.includes(target);
  });
  return {
    provider: 'DEMO_LOCAL',
    checkedAt: new Date().toISOString(),
    clear: hits.length === 0,
    hits,
    note: 'Screening local de démonstration. Un screening habilité (sanctions, PPE) est requis avant mise en production — voir docs/compliance/matrix.md.',
  };
}
