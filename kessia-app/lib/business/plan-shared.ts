// ============================================================
// KESSIA — Business Plan : types + constantes partagés (§17)
// Sans dépendance serveur → importable depuis un composant client.
// La génération du brouillon vit dans lib/business/plan.ts (serveur).
// ============================================================

export type BusinessPlanContent = {
  resume: string;
  clienteleCible: string;
  offre: string;
  differenciation: string;
  canaux: string;
  structureCouts: string;
  previsionnel: string;
  risques: string;
  prochainesActions: string[];
};

export const PLAN_SECTIONS: Array<{ key: keyof BusinessPlanContent; label: string }> = [
  { key: 'resume', label: 'Résumé de l’activité' },
  { key: 'clienteleCible', label: 'Clientèle cible' },
  { key: 'offre', label: 'Offre de produits et services' },
  { key: 'differenciation', label: 'Différenciation' },
  { key: 'canaux', label: 'Canaux de vente' },
  { key: 'structureCouts', label: 'Structure de coûts' },
  { key: 'previsionnel', label: 'Prévisionnel (3 mois)' },
  { key: 'risques', label: 'Risques et points de vigilance' },
];

export function isBusinessPlanContent(v: unknown): v is BusinessPlanContent {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const strKeys: Array<keyof BusinessPlanContent> = [
    'resume', 'clienteleCible', 'offre', 'differenciation', 'canaux', 'structureCouts', 'previsionnel', 'risques',
  ];
  return strKeys.every((k) => typeof o[k] === 'string')
    && Array.isArray(o.prochainesActions)
    && (o.prochainesActions as unknown[]).every((x) => typeof x === 'string');
}
