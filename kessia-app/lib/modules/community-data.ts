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

// ── Messagerie (démonstration) ──────────────────────────────
// Aperçu de ce à quoi ressemblera la messagerie de KESSIA Communauté.
// Envoyer un message est simulé côté client (réponse automatique après
// un court délai) : rien n'est transmis à un autre utilisateur réel, et
// rien n'est persisté. L'appel vidéo n'est qu'un bouton d'aperçu — voir
// ConversationThread dans community-client.tsx.

export interface Conversation {
  id: string;
  withName: string;
  withInitials: string;
  group: string;
  unread: number;
}

export const COMMUNITY_CONVERSATIONS: Conversation[] = [
  { id: 'c1', withName: 'Ama Dossou', withInitials: 'AD', group: 'Commerçantes de Lomé', unread: 2 },
  { id: 'c2', withName: 'Koffi Mensah', withInitials: 'KM', group: 'Tech & Digital Togo', unread: 0 },
  { id: 'c3', withName: 'Afiwa Kokou', withInitials: 'AK', group: 'Artisans & Créateurs', unread: 1 },
  { id: 'c4', withName: 'Yao Ayao', withInitials: 'YA', group: 'Agripreneurs du Togo', unread: 0 },
];

export interface ChatMessage {
  id: string;
  conversationId: string;
  from: 'me' | 'them';
  text: string;
  time: string;
}

export const COMMUNITY_MESSAGES: ChatMessage[] = [
  { id: 'm1', conversationId: 'c1', from: 'them', text: 'Bonjour ! Tu cherchais un fournisseur de pagnes wax, j’en ai un fiable à Lomé.', time: '10:12' },
  { id: 'm2', conversationId: 'c1', from: 'me', text: 'Avec plaisir, tu peux me donner son contact ?', time: '10:15' },
  { id: 'm3', conversationId: 'c1', from: 'them', text: 'Je t’envoie ça, il livre aussi en dehors de Lomé.', time: '10:16' },
  { id: 'm4', conversationId: 'c2', from: 'them', text: 'Salut, tu as vu le nouveau cours sur KESSIA Academy ?', time: 'hier' },
  { id: 'm5', conversationId: 'c3', from: 'them', text: 'Il reste 2 places dans la tontine Achat pour les machines à coudre !', time: 'hier' },
  { id: 'm6', conversationId: 'c4', from: 'me', text: 'Merci pour les contacts côté écoulement, ça a bien avancé.', time: 'il y a 2 jours' },
];

// Réponses automatiques après un message envoyé (simulation, pas d'IA
// ni d'interlocuteur réel derrière).
export const AUTO_REPLIES = [
  'D’accord, merci pour le message !',
  'Bien reçu, je regarde ça et je reviens vers toi.',
  'Ah super, on en parle au prochain point du groupe ?',
  'Noté, merci beaucoup 🙏',
];
