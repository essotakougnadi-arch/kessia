// ============================================================
// KESSIA Academy — contenu de démonstration (§10)
// Aperçu du catalogue à venir. Aucun contenu de cours réel n'est
// servi ; l'inscription est simulée côté client.
// ============================================================

export type CourseLevel = 'Débutant' | 'Intermédiaire' | 'Avancé';

export interface Course {
  id: string;
  title: string;
  category: string;
  level: CourseLevel;
  duration: string;
  instructor: string;
  icon: string;
  students: number;
  summary: string;
}

export const COURSE_CATEGORIES = [
  'Entrepreneuriat',
  'Gestion',
  'Finance',
  'Vente & Marketing',
  'Numérique',
] as const;

export const COURSES: Course[] = [
  { id: 'c1', title: 'Lancer son activité au Togo', category: 'Entrepreneuriat', level: 'Débutant', duration: '2 h 30', instructor: 'Ama Dossou', icon: '🚀', students: 412, summary: 'Formalités, statuts, premiers pas administratifs et financiers pour démarrer sereinement.' },
  { id: 'c2', title: 'Tenir sa comptabilité au quotidien', category: 'Gestion', level: 'Débutant', duration: '1 h 45', instructor: 'Kossi Amétépé', icon: '📒', students: 356, summary: 'Suivre ses ventes, ses dépenses et sa trésorerie sans logiciel compliqué.' },
  { id: 'c3', title: 'Fixer le juste prix de ses produits', category: 'Vente & Marketing', level: 'Débutant', duration: '1 h 10', instructor: 'Afiwa Kougblenou', icon: '🏷️', students: 289, summary: 'Coûts, marge, concurrence : construire une grille tarifaire qui protège votre activité.' },
  { id: 'c4', title: 'Négocier avec ses fournisseurs', category: 'Gestion', level: 'Intermédiaire', duration: '1 h 20', instructor: 'Koffi Mensah', icon: '🤝', students: 201, summary: 'Obtenir de meilleures conditions d’achat et sécuriser ses approvisionnements.' },
  { id: 'c5', title: 'Comprendre son KESSIA Score', category: 'Finance', level: 'Débutant', duration: '40 min', instructor: 'Équipe KESSIA', icon: '⭐', students: 530, summary: 'Ce qui fait progresser votre fiabilité — et comment vous en servir face à un partenaire.' },
  { id: 'c6', title: 'Vendre sur les réseaux sociaux', category: 'Vente & Marketing', level: 'Intermédiaire', duration: '2 h 00', instructor: 'Akossiwa Nyavor', icon: '📱', students: 244, summary: 'Whatsapp Business, visuels simples, gérer les commandes sans se perdre.' },
  { id: 'c7', title: 'Préparer un dossier de financement', category: 'Finance', level: 'Avancé', duration: '2 h 15', instructor: 'Yao Agbeko', icon: '📊', students: 118, summary: 'Business plan, prévisionnel, présentation à un partenaire ou une tontine Projet.' },
  { id: 'c8', title: 'Bureautique de base pour son activité', category: 'Numérique', level: 'Débutant', duration: '1 h 30', instructor: 'Rita Amégée', icon: '💻', students: 176, summary: 'Devis, factures et suivi client avec des outils simples et gratuits.' },
];
