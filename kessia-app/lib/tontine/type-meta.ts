// ============================================================
// KESSIA — Les 4 types de tontines (cahier des charges §6.4)
// Métadonnées partagées client / serveur. Aucune I/O.
// ============================================================

import type { TontineType, PurchaseMode } from '@prisma/client';

export type DistributionMode =
  | 'rotating' // à chaque tour, un membre reçoit la cagnotte
  | 'project' // collecte unique → versée à l'organisateur en fin de cycle
  | 'growth' // épargne disciplinée → chacun récupère sa mise en fin de cycle
  | 'solo'; // achat individuel : une personne épargne pour son propre article

export type TontineTypeMeta = {
  key: TontineType;
  label: string;
  tagline: string;
  description: string;
  icon: string;
  /** couleur d'accent (token CSS ou hex) */
  accent: string;
  distribution: DistributionMode;
  howItWorks: string[];
};

export const TONTINE_TYPES: readonly TontineTypeMeta[] = [
  {
    key: 'CLASSIC_ROTATING',
    label: 'Classique Tournante',
    tagline: 'Chacun son tour reçoit la cagnotte',
    description:
      "La tontine traditionnelle : tous les membres cotisent le même montant à chaque tour, et à chaque tour un membre différent encaisse la totalité de la cagnotte, jusqu'à ce que chacun ait reçu sa part.",
    icon: '🔄',
    accent: '#B65A3A',
    distribution: 'rotating',
    howItWorks: [
      'Le groupe fixe le montant et la fréquence.',
      'À chaque échéance, tous les membres cotisent.',
      "Un membre — selon l'ordre de passage — reçoit la cagnotte complète.",
      'Le cycle se termine quand chaque membre a reçu une fois.',
    ],
  },
  {
    key: 'PROJECT',
    label: 'Projet',
    tagline: 'Financer un objectif commun',
    description:
      "Le groupe épargne ensemble vers un projet précis (matériel, événement, stock…). Les cotisations s'accumulent et la totalité est versée à l'organisateur du projet en fin de collecte.",
    icon: '🎯',
    accent: '#1F5D4A',
    distribution: 'project',
    howItWorks: [
      "Un objectif et un montant cible sont définis à la création.",
      'Chaque membre contribue une fois (ou en plusieurs échéances).',
      "Quand tout le monde a contribué, la cagnotte est versée à l'organisateur.",
      "L'organisateur exécute le projet pour le groupe.",
    ],
  },
  {
    key: 'GROWTH',
    label: 'Croissance',
    tagline: "Épargne de groupe, disciplinée",
    description:
      "Un club d'épargne : chaque membre cotise à chaque échéance pendant tout le cycle, sans rien retirer entre-temps. En fin de cycle, chacun récupère l'intégralité de ce qu'il a versé. La contrainte de groupe aide à tenir l'objectif.",
    icon: '📈',
    accent: '#D6A84F',
    distribution: 'growth',
    howItWorks: [
      'Le groupe fixe le montant, la fréquence et la durée.',
      'Chaque membre cotise à chaque échéance.',
      "Aucun versement pendant le cycle — l'épargne reste bloquée.",
      "En fin de cycle, chaque membre récupère sa mise totale.",
    ],
  },
  {
    key: 'PURCHASE',
    label: 'Achat',
    tagline: 'Acheter groupé, chacun son tour — ou en solo pour soi',
    description:
      "Tontine orientée achat, en deux formules. En groupe : à chaque tour, le membre bénéficiaire utilise la cagnotte pour un achat (équipement, marchandise en gros, appareil…), chacun son tour. En solo : une personne épargne seule, pour son propre article — l'argent est bloqué en séquestre jusqu'au dernier versement, puis recrédité sur son wallet pour acheter.",
    icon: '🛒',
    accent: '#7A5CC0',
    distribution: 'rotating',
    howItWorks: [
      'Choisissez la formule : en groupe (chacun son tour) ou individuelle (pour vous).',
      'En groupe : tous cotisent, le bénéficiaire du tour reçoit la cagnotte pour son achat.',
      "En solo : vous fixez le prix de l'article et le nombre de versements ; KESSIA calcule chaque échéance.",
      "En solo : vos versements sont détenus en séquestre jusqu'au bout, puis recrédités pour l'achat.",
    ],
  },
] as const;

const BY_KEY = Object.fromEntries(TONTINE_TYPES.map((t) => [t.key, t])) as Record<TontineType, TontineTypeMeta>;

export function tontineTypeMeta(type: TontineType): TontineTypeMeta {
  return BY_KEY[type] ?? BY_KEY.CLASSIC_ROTATING;
}

export const TONTINE_TYPE_KEYS = TONTINE_TYPES.map((t) => t.key) as [TontineType, ...TontineType[]];

/**
 * Mode de distribution effectif d'une tontine. Identique à
 * `tontineTypeMeta(type).distribution`, sauf pour la tontine Achat :
 * le sous-mode `purchaseMode` décide entre achat groupé (`rotating`)
 * et achat individuel (`solo`).
 */
export function resolveDistribution(
  type: TontineType,
  purchaseMode?: PurchaseMode | null
): DistributionMode {
  if (type === 'PURCHASE' && purchaseMode === 'SOLO') return 'solo';
  return tontineTypeMeta(type).distribution;
}

/**
 * Nombre de tours d'un cycle.
 *  - rotating / growth : un tour par membre
 *  - project           : une seule collecte
 *  - solo              : le nombre de versements choisi (`plannedRounds`)
 */
export function totalRoundsForType(
  type: TontineType,
  memberCount: number,
  opts?: { purchaseMode?: PurchaseMode | null; plannedRounds?: number | null }
): number {
  const distribution = resolveDistribution(type, opts?.purchaseMode);
  if (distribution === 'solo') return Math.max(1, opts?.plannedRounds ?? 1);
  if (distribution === 'project') return 1;
  return Math.max(1, memberCount);
}

/**
 * Achat individuel : montant de chaque versement, dérivé du prix cible
 * de l'article et du nombre de versements. Arrondi à l'unité ; le total
 * mobilisé (`perPayment × rounds`) peut donc dépasser la cible de
 * quelques FCFA — surplus conservé par l'acheteur.
 */
export function soloContributionAmount(targetAmount: number, plannedRounds: number): number {
  if (!Number.isFinite(targetAmount) || !Number.isFinite(plannedRounds)) return 0;
  if (targetAmount <= 0 || plannedRounds < 1) return 0;
  return Math.max(1, Math.round(targetAmount / plannedRounds));
}
