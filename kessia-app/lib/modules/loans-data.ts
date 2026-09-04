// ============================================================
// KESSIA Prêts coopératifs — contenu de démonstration (ADR 0041, item 7)
// Module REGULATED (cf. lib/modules/catalog.ts) : accorder un crédit,
// même sans intérêt, est une activité potentiellement réglementée.
// Présenté au stade « à quoi ça ressemblera », SANS octroi réel — les
// demandes ci-dessous sont des EXEMPLES PÉDAGOGIQUES.
// ============================================================

export interface LoanCategory {
  icon: string;
  title: string;
  desc: string;
}

export const LOAN_CATEGORIES: LoanCategory[] = [
  { icon: '🚨', title: 'Besoin urgent', desc: 'Imprévu de santé, réparation essentielle, dépense de première nécessité.' },
  { icon: '📈', title: 'Développement d’activité', desc: 'Stock, petit équipement, avance de trésorerie pour une activité déjà en marche.' },
  { icon: '🎓', title: 'Études & formation', desc: 'Frais de scolarité, matériel pédagogique, formation professionnelle.' },
  { icon: '👨‍👩‍👧', title: 'Famille', desc: 'Événement familial, dépense partagée entre proches membres de la coopérative.' },
];

export interface ExampleLoanRequest {
  id: string;
  title: string;
  category: string; // doit correspondre à un title de LOAN_CATEGORIES
  icon: string;
  requestedAmount: number; // FCFA — exemple
  fundedPercent: number; // 0-100 — exemple
  durationMonths: number;
  description: string;
}

export const LOAN_EXAMPLE_REQUESTS: ExampleLoanRequest[] = [
  {
    id: 'l-sante',
    title: 'Frais d’hospitalisation d’un enfant',
    category: 'Besoin urgent',
    icon: '🚨',
    requestedAmount: 250_000,
    fundedPercent: 64,
    durationMonths: 6,
    description: 'Avance pour couvrir des frais médicaux imprévus, à rembourser sans intérêt sur 6 mois.',
  },
  {
    id: 'l-stock',
    title: 'Réassort de stock avant la rentrée',
    category: 'Développement d’activité',
    icon: '📈',
    requestedAmount: 400_000,
    fundedPercent: 38,
    durationMonths: 8,
    description: 'Compléter le stock d’une boutique de fournitures scolaires avant le pic de septembre.',
  },
  {
    id: 'l-etudes',
    title: 'Frais universitaires du 2ᵉ semestre',
    category: 'Études & formation',
    icon: '🎓',
    requestedAmount: 180_000,
    fundedPercent: 82,
    durationMonths: 10,
    description: 'Compléter les frais de scolarité en attendant le versement d’une bourse partielle.',
  },
  {
    id: 'l-atelier',
    title: 'Réparation d’un four de boulangerie',
    category: 'Développement d’activité',
    icon: '📈',
    requestedAmount: 320_000,
    fundedPercent: 21,
    durationMonths: 12,
    description: 'Panne du four principal — avance pour la pièce et la main d’œuvre, remboursement échelonné.',
  },
  {
    id: 'l-famille',
    title: 'Frais funéraires — soutien familial',
    category: 'Famille',
    icon: '👨‍👩‍👧',
    requestedAmount: 150_000,
    fundedPercent: 91,
    durationMonths: 4,
    description: 'Solidarité entre membres de la coopérative pour accompagner une famille endeuillée.',
  },
];
