// ============================================================
// KESSIA Score — types (cahier des charges §10, §22)
// Score de confiance **explicable** : chaque point est justifié par
// une règle lisible. Aucune « boîte noire », pas de donnée sensible.
// ============================================================

export type ScoreBand = 'NOUVEAU' | 'EN_CONSTRUCTION' | 'FIABLE' | 'TRES_FIABLE' | 'EXEMPLAIRE';

export type ScoreFactor = {
  /** identifiant stable de la règle */
  key: string;
  /** libellé affiché à l'utilisateur */
  label: string;
  /** points obtenus (peut être négatif) */
  points: number;
  /** points maximum atteignables sur ce facteur */
  max: number;
  /** explication concrète (« 4 cotisations payées à temps ») */
  detail: string;
};

export type KessiaScore = {
  score: number; // 0 – 1000
  band: ScoreBand;
  bandLabel: string;
  factors: ScoreFactor[];
  /** conseils d'amélioration priorisés */
  advice: string[];
  generatedAt: string;
};
