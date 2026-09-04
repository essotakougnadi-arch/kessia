// ============================================================
// KESSIA Invest / KESSIA Insurance — contenu de démonstration (§13, §14)
// Modules REGULATED (cf. lib/modules/catalog.ts) : présentés au
// stade « à quoi ça ressemblera », SANS offre, montant, prime ou
// promesse de rendement. Ouverture soumise à validation
// réglementaire et à l'intégration de partenaires habilités.
// ============================================================

export interface ModuleCategory {
  icon: string;
  title: string;
  desc: string;
}

export const INVEST_CATEGORIES: ModuleCategory[] = [
  { icon: '🌾', title: 'Projets agricoles', desc: 'Campagnes, matériel, transformation — mis en relation avec des partenaires financiers habilités.' },
  { icon: '🏪', title: 'Commerce & distribution', desc: 'Stock, points de vente, expansion d’une activité déjà en marche.' },
  { icon: '🧵', title: 'Artisanat & production', desc: 'Équipement, ateliers, montée en capacité de production.' },
  { icon: '💻', title: 'Services & numérique', desc: 'Applications, plateformes et services aux entreprises locales.' },
];

export const INSURANCE_CATEGORIES: ModuleCategory[] = [
  { icon: '🩺', title: 'Santé', desc: 'Couverture individuelle ou familiale, proposée par des assureurs habilités.' },
  { icon: '🏍️', title: 'Auto & moto', desc: 'Protection du véhicule utilisé pour vos livraisons ou déplacements professionnels.' },
  { icon: '🏠', title: 'Habitation', desc: 'Logement personnel ou local commercial.' },
  { icon: '🏢', title: 'Activité professionnelle', desc: 'Stock, matériel, responsabilité civile de votre entreprise.' },
];
