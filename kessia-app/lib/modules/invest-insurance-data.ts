// ============================================================
// KESSIA Invest / KESSIA Insurance — contenu de démonstration (§13, §14)
// Modules REGULATED (cf. lib/modules/catalog.ts) : ouverture soumise
// à validation réglementaire et à l'intégration de partenaires habilités.
//
// Les projets/formules ci-dessous sont des EXEMPLES PÉDAGOGIQUES pour
// donner à voir la forme du module — jamais une offre réelle. Chaque
// montant est explicitement qualifié « indicatif »/« exemple » dans son
// libellé, et les deux pages répètent le disclaimer dans un bandeau.
// Ne JAMAIS retirer ces qualificatifs en modifiant ce fichier.
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

// ── Exemples de projets (Invest) ──────────────────────────────
// fundedPercent/goalAmount sont illustratifs (démonstration de forme).
// targetReturnLabel porte TOUJOURS la mention « indicatif » et « non garanti ».

export interface ExampleProject {
  id: string;
  title: string;
  category: string; // doit correspondre à un title de INVEST_CATEGORIES
  icon: string;
  location: string;
  goalAmount: number; // FCFA — exemple
  fundedPercent: number; // 0-100 — exemple
  durationMonths: number;
  targetReturnLabel: string;
  description: string;
}

export const INVEST_EXAMPLE_PROJECTS: ExampleProject[] = [
  {
    id: 'p-avicole',
    title: 'Ferme avicole — extension du poulailler',
    category: 'Projets agricoles',
    icon: '🐔',
    location: 'Kara',
    goalAmount: 2_500_000,
    fundedPercent: 62,
    durationMonths: 18,
    targetReturnLabel: 'Objectif indicatif 6–9 %/an (exemple, non garanti)',
    description: 'Doubler la capacité d’élevage pour répondre à la demande locale et créer 2 emplois saisonniers.',
  },
  {
    id: 'p-riz',
    title: 'Coopérative rizicole — matériel de transformation',
    category: 'Projets agricoles',
    icon: '🌾',
    location: 'Vallée du Zio',
    goalAmount: 4_200_000,
    fundedPercent: 38,
    durationMonths: 24,
    targetReturnLabel: 'Objectif indicatif 5–8 %/an (exemple, non garanti)',
    description: 'Décortiqueuse et séchoir pour réduire les pertes post-récolte de 25 coopérateurs.',
  },
  {
    id: 'p-boutique',
    title: 'Boutique de quartier — second point de vente',
    category: 'Commerce & distribution',
    icon: '🏪',
    location: 'Lomé, Bè',
    goalAmount: 1_800_000,
    fundedPercent: 81,
    durationMonths: 12,
    targetReturnLabel: 'Objectif indicatif 7–10 %/an (exemple, non garanti)',
    description: 'Ouverture d’un second point de vente pour une épicerie déjà rentable depuis 3 ans.',
  },
  {
    id: 'p-couture',
    title: 'Atelier de couture — machines industrielles',
    category: 'Artisanat & production',
    icon: '🧵',
    location: 'Kpalimé',
    goalAmount: 1_200_000,
    fundedPercent: 54,
    durationMonths: 15,
    targetReturnLabel: 'Objectif indicatif 6–8 %/an (exemple, non garanti)',
    description: 'Remplacer 4 machines manuelles par des machines industrielles pour tripler la cadence de production.',
  },
  {
    id: 'p-app',
    title: 'Plateforme de livraison locale — développement',
    category: 'Services & numérique',
    icon: '💻',
    location: 'Lomé',
    goalAmount: 3_000_000,
    fundedPercent: 21,
    durationMonths: 20,
    targetReturnLabel: 'Objectif indicatif 8–12 %/an (exemple, non garanti — risque plus élevé)',
    description: 'Application de mise en relation entre commerçants de quartier et livreurs à vélo.',
  },
];

// ── Exemples de formules (Insurance) ──────────────────────────
// examplePremiumLabel porte TOUJOURS la mention « exemple »/« non contractuel ».

export interface ExamplePlan {
  id: string;
  title: string;
  category: string; // doit correspondre à un title de INSURANCE_CATEGORIES
  icon: string;
  coverageHighlights: string[];
  examplePremiumLabel: string;
  description: string;
}

export const INSURANCE_EXAMPLE_PLANS: ExamplePlan[] = [
  {
    id: 'i-sante-essentielle',
    title: 'Santé Essentielle',
    category: 'Santé',
    icon: '🩺',
    coverageHighlights: ['Consultations', 'Pharmacie', 'Hospitalisation de base'],
    examplePremiumLabel: 'À partir de ≈ 2 500 FCFA/mois (exemple, non contractuel)',
    description: 'Couverture individuelle des soins courants, pour un entrepreneur sans mutuelle employeur.',
  },
  {
    id: 'i-sante-famille',
    title: 'Santé Famille',
    category: 'Santé',
    icon: '👨‍👩‍👧',
    coverageHighlights: ['Consultations', 'Maternité', 'Hospitalisation', 'Pharmacie'],
    examplePremiumLabel: 'À partir de ≈ 9 000 FCFA/mois pour 4 personnes (exemple, non contractuel)',
    description: 'Couverture familiale élargie incluant le suivi maternité.',
  },
  {
    id: 'i-moto-livraison',
    title: 'Moto Livraison',
    category: 'Auto & moto',
    icon: '🏍️',
    coverageHighlights: ['Dommages', 'Vol', 'Responsabilité civile'],
    examplePremiumLabel: 'À partir de ≈ 3 200 FCFA/mois (exemple, non contractuel)',
    description: 'Protection du deux-roues utilisé pour les livraisons ou déplacements professionnels quotidiens.',
  },
  {
    id: 'i-local-commercial',
    title: 'Local Commercial',
    category: 'Activité professionnelle',
    icon: '🏢',
    coverageHighlights: ['Incendie', 'Dégât des eaux', 'Vol du stock'],
    examplePremiumLabel: 'À partir de ≈ 5 500 FCFA/mois (exemple, non contractuel)',
    description: 'Protection du local, du matériel et du stock d’une boutique ou d’un atelier.',
  },
  {
    id: 'i-habitation',
    title: 'Habitation',
    category: 'Habitation',
    icon: '🏠',
    coverageHighlights: ['Incendie', 'Dégât des eaux', 'Responsabilité civile'],
    examplePremiumLabel: 'À partir de ≈ 4 000 FCFA/mois (exemple, non contractuel)',
    description: 'Protection du logement familial et de son contenu.',
  },
];
