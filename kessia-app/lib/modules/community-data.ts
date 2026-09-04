// ============================================================
// KESSIA Communauté — contenu de démonstration (§11)
// Aperçu des groupes et du fil à venir. Rejoindre / aimer sont
// simulés côté client (pas de messagerie ni de modération réelle).
// ============================================================

export interface CommunityGroup {
  id: string;
  name: string;
  sector: string;
  city: string;
  members: number;
  icon: string;
  description: string;
}

export const COMMUNITY_GROUPS: CommunityGroup[] = [
  { id: 'g1', name: 'Commerçantes de Lomé', sector: 'Commerce', city: 'Lomé', members: 1240, icon: '🧺', description: 'Entraide entre commerçantes des grands marchés — prix, fournisseurs, tontines.' },
  { id: 'g2', name: 'Agripreneurs du Togo', sector: 'Agriculture', city: 'Kara', members: 860, icon: '🌾', description: 'Techniques, intrants, écoulement des récoltes et accès aux tontines Projet.' },
  { id: 'g3', name: 'Artisans & Créateurs', sector: 'Artisanat', city: 'Lomé', members: 512, icon: '🧵', description: 'Couture, menuiserie, bijouterie — partager clients et bonnes pratiques.' },
  { id: 'g4', name: 'Tech & Digital Togo', sector: 'Numérique', city: 'Lomé', members: 398, icon: '💻', description: 'Freelances et petites structures du numérique, veille et missions partagées.' },
  { id: 'g5', name: 'Restauratrices & Traiteurs', sector: 'Restauration', city: 'Lomé', members: 674, icon: '🍲', description: 'Recettes, hygiène, gestion des commandes en période de forte demande.' },
  { id: 'g6', name: 'Jeunes Entrepreneurs Kara', sector: 'Entrepreneuriat', city: 'Kara', members: 305, icon: '🚀', description: 'Un groupe pour se lancer, trouver un mentor et une première tontine.' },
];

export interface CommunityPost {
  id: string;
  author: string;
  group: string;
  time: string;
  text: string;
  likes: number;
}

export const COMMUNITY_FEED: CommunityPost[] = [
  { id: 'p1', author: 'Ama D.', group: 'Commerçantes de Lomé', time: 'il y a 2 h', text: 'Qui a un bon fournisseur de pagnes wax en gros en ce moment ? La qualité a baissé chez le mien.', likes: 14 },
  { id: 'p2', author: 'Koffi M.', group: 'Tech & Digital Togo', time: 'il y a 5 h', text: 'J’ai terminé le cours « Vendre sur les réseaux sociaux » sur KESSIA Academy — vraiment concret, je recommande.', likes: 22 },
  { id: 'p3', author: 'Afiwa K.', group: 'Artisans & Créateurs', time: 'hier', text: 'Notre tontine Achat pour les machines à coudre démarre la semaine prochaine, encore 2 places !', likes: 9 },
  { id: 'p4', author: 'Yao A.', group: 'Agripreneurs du Togo', time: 'il y a 2 jours', text: 'Bon rendement sur le maïs cette saison. Quelqu’un a des contacts pour l’écoulement vers Lomé ?', likes: 17 },
];
