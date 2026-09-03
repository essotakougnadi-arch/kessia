// ============================================================
// KESSIA — Catalogue des services (cahier des charges §5, §9–§16, §37)
//
// Recense les modules livrés et ceux de la feuille de route Phase 8.
// Les modules « à venir » ne sont PAS construits ; la page /explore
// les présente honnêtement et mesure l'intérêt des utilisateurs.
// ============================================================

export type ModuleStatus = 'LIVE' | 'SOON' | 'REGULATED';

export type ModuleEntry = {
  key: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  accent: string;
  status: ModuleStatus;
  href?: string;
  /** section du cahier des charges */
  ref: string;
};

export const MODULES: readonly ModuleEntry[] = [
  {
    key: 'wallet', name: 'Wallet', tagline: 'Envoyer, recevoir, épargner',
    description: 'Solde, historique, dépôts et retraits via Mobile Money, transferts entre membres, QR code, reçus.',
    icon: '💰', accent: '#B65A3A', status: 'LIVE', href: '/wallet', ref: '§6.1',
  },
  {
    key: 'tontine', name: 'Tontines', tagline: 'Épargner ensemble',
    description: 'Les 4 types de tontines (Classique, Projet, Croissance, Achat), contrat numérique, cycle et versements automatiques, Fonds de Garantie Solidaire.',
    icon: '🔄', accent: '#1F5D4A', status: 'LIVE', href: '/tontine', ref: '§6.4',
  },
  {
    key: 'business', name: 'Business', tagline: 'Gérer son activité',
    description: 'Produits, ventes, dépenses, clients, fournisseurs, devis et factures, trésorerie, objectifs, ADN de l’entreprise.',
    icon: '🏪', accent: '#D6A84F', status: 'LIVE', href: '/business', ref: '§7',
  },
  {
    key: 'ai', name: 'KESSIA AI', tagline: 'Un assistant qui explique',
    description: 'Aide contextuelle, conseils dérivés de vos données (échéances, marge, stock), guidage pas à pas.',
    icon: '✨', accent: '#7A5CC0', status: 'LIVE', href: '/ai', ref: '§17',
  },
  {
    key: 'score', name: 'KESSIA Score', tagline: 'Votre fiabilité, expliquée',
    description: 'Score de confiance à base de règles transparentes. Ce n’est pas un score de crédit réglementé.',
    icon: '⭐', accent: '#B65A3A', status: 'LIVE', href: '/profile/score', ref: '§6.6',
  },
  {
    key: 'growth', name: 'Plan de croissance', tagline: 'Vos prochaines étapes',
    description: 'Objectif → action → échéance → indicateur : un plan concret dérivé de votre Score, de l’ADN de vos activités et de vos tontines.',
    icon: '🌱', accent: '#1F5D4A', status: 'LIVE', href: '/growth', ref: '§23',
  },
  {
    key: 'simulator', name: 'Simulateurs', tagline: 'Décider avec des projections',
    description: 'Épargne, tontine, activité : projetez les montants avant de vous lancer. Des projections, jamais des promesses de rendement.',
    icon: '🧮', accent: '#7A5CC0', status: 'LIVE', href: '/simulator', ref: '§20',
  },
  {
    key: 'calendar', name: 'Agenda', tagline: 'Toutes vos échéances',
    description: 'Cotisations de tontine, factures à encaisser, échéances du plan de croissance et relances clients, réunies au même endroit.',
    icon: '🗓️', accent: '#B65A3A', status: 'LIVE', href: '/calendar', ref: '§26',
  },
  {
    key: 'trust', name: 'Transparence', tagline: 'Tarifs, plafonds, droits',
    description: 'Grille tarifaire complète, plafonds selon votre niveau KYC, état de vos données et de votre sécurité, mentions réglementaires.',
    icon: '⚖️', accent: '#1F5D4A', status: 'LIVE', href: '/trust', ref: '§21',
  },
  {
    key: 'market', name: 'KESSIA Market', tagline: 'Acheter et vendre dans la communauté',
    description: 'Marketplace de produits et services entre membres. Paiement depuis le wallet, ou par tontine Achat individuelle pour financer un article progressivement.',
    icon: '🛒', accent: '#B65A3A', status: 'LIVE', href: '/marketplace', ref: '§16',
  },
  {
    key: 'learn', name: 'KESSIA Academy', tagline: 'Se former pour grandir',
    description: 'Cours (entrepreneuriat, gestion, finance, vente), quiz, progression, certification. Mentorat et cohortes en Academy+.',
    icon: '🎓', accent: '#1F5D4A', status: 'SOON', ref: '§10',
  },
  {
    key: 'community', name: 'Communauté', tagline: 'Se connecter, échanger',
    description: 'Fil, groupes, forums, messagerie, événements, profils professionnels. La modération est intégrée.',
    icon: '🤝', accent: '#D6A84F', status: 'SOON', ref: '§11',
  },
  {
    key: 'jobs', name: 'KESSIA Jobs', tagline: 'Emplois, stages, missions',
    description: 'Offres d’emploi et de freelance, candidatures, aide de l’IA au CV et à la préparation d’entretien.',
    icon: '💼', accent: '#7A5CC0', status: 'SOON', ref: '§12',
  },
  {
    key: 'invest', name: 'KESSIA Invest', tagline: 'Financer des projets',
    description: 'Mise en relation entre porteurs de projets et partenaires financiers. Ce module ne sera ouvert qu’après validation réglementaire — aucune promesse de rendement.',
    icon: '📈', accent: '#1F5D4A', status: 'REGULATED', ref: '§13',
  },
  {
    key: 'insurance', name: 'KESSIA Insurance', tagline: 'Se protéger via des partenaires',
    description: 'Découverte, comparaison et souscription de produits d’assurance proposés par des assureurs habilités. KESSIA agit comme intermédiaire, jamais comme assureur.',
    icon: '🛡️', accent: '#D6A84F', status: 'REGULATED', ref: '§14',
  },
  {
    key: 'diaspora', name: 'KESSIA Global / Diaspora', tagline: 'Soutenir depuis l’étranger',
    description: 'Découverte de projets, contributions autorisées, suivi, services transfrontaliers selon disponibilité.',
    icon: '🌍', accent: '#B65A3A', status: 'SOON', ref: '§15',
  },
] as const;

export const LIVE_MODULES = MODULES.filter((m) => m.status === 'LIVE');
export const UPCOMING_MODULES = MODULES.filter((m) => m.status !== 'LIVE');
export const INTEREST_KEYS = UPCOMING_MODULES.map((m) => m.key);

export function moduleByKey(key: string): ModuleEntry | undefined {
  return MODULES.find((m) => m.key === key);
}

export const STATUS_LABEL: Record<ModuleStatus, string> = {
  LIVE: 'Disponible',
  SOON: 'En préparation',
  REGULATED: 'Après validation réglementaire',
};
