// ============================================================
// KESSIA Jobs — contenu de démonstration (§12)
// Aperçu des offres à venir. La candidature est simulée côté
// client — pas d'envoi réel, pas encore d'aide IA au CV.
// ============================================================

export type JobType = 'CDI' | 'CDD' | 'Stage' | 'Freelance';

export interface JobListing {
  id: string;
  title: string;
  company: string;
  city: string;
  type: JobType;
  sector: string;
  postedDaysAgo: number;
  salary: string;
  description: string;
}

export const JOB_TYPES: JobType[] = ['CDI', 'CDD', 'Stage', 'Freelance'];

export const JOB_LISTINGS: JobListing[] = [
  { id: 'j1', title: 'Vendeuse en boutique', company: 'Boutique Zita Mode', city: 'Lomé', type: 'CDI', sector: 'Commerce', postedDaysAgo: 2, salary: '60 000 – 80 000 FCFA/mois', description: 'Accueil client, encaissement, mise en rayon. Expérience en vente appréciée.' },
  { id: 'j2', title: 'Comptable junior', company: 'Atelier Kossi Électronique', city: 'Lomé', type: 'CDD', sector: 'Finance', postedDaysAgo: 4, salary: '90 000 – 120 000 FCFA/mois', description: 'Suivi des factures, rapprochement de caisse, appui à la clôture mensuelle.' },
  { id: 'j3', title: 'Développeur·se web freelance', company: 'Kossi Digital Services', city: 'Lomé (à distance)', type: 'Freelance', sector: 'Numérique', postedDaysAgo: 1, salary: 'Selon mission', description: 'Sites vitrines et boutiques en ligne pour des PME locales. Missions courtes.' },
  { id: 'j4', title: 'Assistant·e community management', company: 'Boutique Zita Mode', city: 'Lomé', type: 'Stage', sector: 'Marketing', postedDaysAgo: 6, salary: 'Indemnité de stage', description: 'Réseaux sociaux, visuels simples, réponses aux messages clients.' },
  { id: 'j5', title: 'Livreur / livreuse moto', company: 'Marché Central Traiteurs', city: 'Lomé', type: 'CDD', sector: 'Logistique', postedDaysAgo: 3, salary: '50 000 – 65 000 FCFA/mois', description: 'Livraisons de commandes en ville, permis moto requis.' },
  { id: 'j6', title: 'Formateur·rice en gestion', company: 'KESSIA Academy (partenaire)', city: 'Kara', type: 'Freelance', sector: 'Formation', postedDaysAgo: 8, salary: 'Vacation', description: 'Animer des ateliers de gestion de trésorerie pour micro-entrepreneurs.' },
];
