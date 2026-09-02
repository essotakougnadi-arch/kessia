// ============================================================
// KESSIA — Profils utilisateur (cahier des charges §4)
//
// Le `userType` est déclaratif : il oriente l'onboarding, les
// suggestions de KESSIA AI et les KPI. Il est distinct du rôle RBAC
// (`UserRole`), qui gouverne les permissions.
//
// Les 5 premiers types sont sélectionnables dans le MVP. Les suivants
// (mentor, formateur, fournisseur, institution, partenaires) ouvrent
// des parcours de Phase 8 (Community, Academy, Market, Assurance) et
// ne sont pas encore proposés à l'inscription.
// ============================================================

import type { UserType } from '@prisma/client';

export type UserTypeMeta = {
  key: UserType;
  label: string;
  hint: string;
  icon: string;
  /** proposé à l'inscription / modifiable dans le MVP */
  mvp: boolean;
  /** modules mis en avant pour ce profil (ordre = priorité) */
  focus: Array<'wallet' | 'tontine' | 'business'>;
  /** premiers pas suggérés sur l'accueil */
  firstSteps: Array<{ label: string; href: string }>;
  /** questions suggérées à KESSIA AI */
  aiPrompts: string[];
};

const NONE: { label: string; href: string }[] = [];

export const USER_TYPES: readonly UserTypeMeta[] = [
  {
    key: 'INDIVIDUAL', label: 'Particulier', icon: '👤', mvp: true, focus: ['wallet', 'tontine'],
    hint: 'Épargner, cotiser en tontine, envoyer et recevoir de l’argent.',
    firstSteps: [
      { label: 'Vérifier mon identité', href: '/profile/kyc' },
      { label: 'Recharger mon wallet', href: '/wallet?action=deposit' },
      { label: 'Simuler un objectif d’épargne', href: '/simulator?sim=savings' },
    ],
    aiPrompts: ['Comment rejoindre une tontine ?', 'Quelle est ma prochaine cotisation ?', 'Quel est mon plan de croissance ?'],
  },
  {
    key: 'BEGINNER_ENTREPRENEUR', label: 'Entrepreneur débutant', icon: '🚀', mvp: true, focus: ['tontine', 'business'],
    hint: 'Se lancer : épargne, première tontine, mise en place de l’activité.',
    firstSteps: [
      { label: 'Vérifier mon identité', href: '/profile/kyc' },
      { label: 'Déclarer mon activité', href: '/business?create=1' },
      { label: 'Simuler ma croissance d’activité', href: '/simulator?sim=business' },
    ],
    aiPrompts: ['Comment créer mon entreprise ?', 'Quelle tontine pour financer un projet ?', 'Quel est mon plan de croissance ?'],
  },
  {
    key: 'MICRO_ENTERPRISE', label: 'Micro-entreprise', icon: '🏪', mvp: true, focus: ['business', 'wallet'],
    hint: 'Gérer les ventes, les dépenses et la trésorerie au quotidien.',
    firstSteps: [
      { label: 'Ajouter mon catalogue', href: '/business' },
      { label: 'Enregistrer une vente', href: '/business' },
      { label: 'Voir mon plan de croissance', href: '/growth' },
    ],
    aiPrompts: ['Mes ventes du mois ?', 'Comment relancer un client ?', 'Quelles opportunités pour mon activité ?'],
  },
  {
    key: 'SME', label: 'PME', icon: '🏢', mvp: true, focus: ['business', 'wallet', 'tontine'],
    hint: 'Piloter l’activité : facturation, stock, clients, tableau de bord.',
    firstSteps: [
      { label: 'Consulter l’ADN de mon entreprise', href: '/business' },
      { label: 'Générer mon plan d’affaires', href: '/business' },
      { label: 'Voir mon plan de croissance', href: '/growth' },
    ],
    aiPrompts: ['Que me dit l’ADN de mon entreprise ?', 'Génère mon plan d’affaires', 'Quelles opportunités pour mon activité ?'],
  },
  {
    key: 'COOPERATIVE', label: 'Coopérative / Groupe', icon: '🤝', mvp: true, focus: ['tontine', 'wallet'],
    hint: 'Animer un groupe : tontines, gouvernance, membres, calendrier.',
    firstSteps: [
      { label: 'Créer une tontine pour le groupe', href: '/tontine?create=1' },
      { label: 'Simuler une tontine', href: '/simulator?sim=tontine' },
      { label: 'Découvrir le Fonds de Garantie', href: '/tontine/garantie' },
    ],
    aiPrompts: ['Quelle tontine pour mon groupe ?', 'Simule une tontine de 10 membres', 'Qu’est-ce que le Fonds de Garantie Solidaire ?'],
  },
  { key: 'MENTOR',            label: 'Mentor',               hint: 'Accompagner des entrepreneurs (parcours Phase 8).',          icon: '🧭', mvp: false, focus: [], firstSteps: NONE, aiPrompts: [] },
  { key: 'TRAINER',           label: 'Formateur',            hint: 'Proposer des formations (parcours Phase 8).',                icon: '🎓', mvp: false, focus: [], firstSteps: NONE, aiPrompts: [] },
  { key: 'SUPPLIER',          label: 'Fournisseur',          hint: 'Vendre sur KESSIA Market (parcours Phase 8).',               icon: '📦', mvp: false, focus: ['business'], firstSteps: NONE, aiPrompts: [] },
  { key: 'INSTITUTION',       label: 'Institution',          hint: 'Structure publique ou partenaire institutionnel (Phase 8).', icon: '🏛️', mvp: false, focus: [], firstSteps: NONE, aiPrompts: [] },
  { key: 'FINANCIAL_PARTNER', label: 'Partenaire financier', hint: 'Banque, opérateur, EME partenaire (Phase 8).',               icon: '💳', mvp: false, focus: [], firstSteps: NONE, aiPrompts: [] },
  { key: 'INSURANCE_PARTNER', label: 'Assureur partenaire',  hint: 'Assureur habilité (parcours Phase 8).',                      icon: '🛡️', mvp: false, focus: [], firstSteps: NONE, aiPrompts: [] },
] as const;

const BY_KEY = Object.fromEntries(USER_TYPES.map((t) => [t.key, t])) as Record<UserType, UserTypeMeta>;

export function userTypeMeta(type: UserType): UserTypeMeta {
  return BY_KEY[type] ?? BY_KEY.INDIVIDUAL;
}

/** Types proposés à l'inscription et dans l'édition de profil (MVP). */
export const MVP_USER_TYPES = USER_TYPES.filter((t) => t.mvp);
export const MVP_USER_TYPE_KEYS = MVP_USER_TYPES.map((t) => t.key) as [UserType, ...UserType[]];
