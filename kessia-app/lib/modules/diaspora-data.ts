// ============================================================
// KESSIA Global / Diaspora — contenu de démonstration (§15)
// Statistiques de communauté purement indicatives (pas de montant
// ni de mouvement de fonds). Les tontines et articles affichés
// sur cette page sont réels (mêmes données que /discover).
// ============================================================

export interface DiasporaCountry {
  country: string;
  flag: string;
  members: number;
}

export const DIASPORA_COMMUNITY: DiasporaCountry[] = [
  { country: 'France', flag: '🇫🇷', members: 340 },
  { country: 'États-Unis', flag: '🇺🇸', members: 210 },
  { country: 'Côte d’Ivoire', flag: '🇨🇮', members: 185 },
  { country: 'Allemagne', flag: '🇩🇪', members: 96 },
  { country: 'Canada', flag: '🇨🇦', members: 88 },
  { country: 'Ghana', flag: '🇬🇭', members: 64 },
];
