// ============================================================
// KESSIA — Zones de livraison & estimation du tarif (ADR 0042)
//
// v1 : Grand Lomé uniquement (couverture Miaride). Chaque quartier
// porte un « anneau » (0 = centre, 1 = intermédiaire, 2 = périphérie).
// Le tarif est une ESTIMATION dérivée de l'écart d'anneaux — jamais
// présentée comme un prix ferme. Purs, testés.
// ============================================================

export type DeliveryZone = {
  /** clé stable, utilisée en base */
  key: string;
  /** libellé affiché */
  label: string;
  /** 0 centre · 1 intermédiaire · 2 périphérie */
  ring: 0 | 1 | 2;
};

/** Quartiers du Grand Lomé couverts par Miaride en v1. */
export const LOME_ZONES: readonly DeliveryZone[] = [
  { key: 'centre-ville', label: 'Centre-ville / Administratif', ring: 0 },
  { key: 'kodjoviakope', label: 'Kodjoviakopé', ring: 0 },
  { key: 'nyekonakpoe', label: 'Nyékonakpoè', ring: 0 },
  { key: 'be', label: 'Bè', ring: 0 },
  { key: 'amoutive', label: 'Amoutivé', ring: 0 },
  { key: 'hanoukope', label: 'Hanoukopé', ring: 0 },
  { key: 'tokoin', label: 'Tokoin', ring: 1 },
  { key: 'hedzranawoe', label: 'Hédzranawoé', ring: 1 },
  { key: 'nyekonakpoe-kelegougan', label: 'Kélégougan', ring: 1 },
  { key: 'djidjole', label: 'Djidjolé', ring: 1 },
  { key: 'agoe', label: 'Agoè-Nyivé', ring: 1 },
  { key: 'adidogome', label: 'Adidogomé', ring: 1 },
  { key: 'totsi', label: 'Totsi', ring: 1 },
  { key: 'cacaveli', label: 'Cacavéli', ring: 1 },
  { key: 'avedji', label: 'Avédji', ring: 1 },
  { key: 'baguida', label: 'Baguida', ring: 2 },
  { key: 'kegue', label: 'Kégué', ring: 2 },
  { key: 'adakpame', label: 'Adakpamé', ring: 2 },
  { key: 'legbassito', label: 'Legbassito', ring: 2 },
  { key: 'sanguera', label: 'Sanguéra', ring: 2 },
  { key: 'zanguera', label: 'Zanguéra', ring: 2 },
  { key: 'aflao-gakli', label: 'Aflao-Gakli', ring: 2 },
  { key: 'togblekope', label: 'Togblékopé', ring: 2 },
];

const BY_KEY = new Map(LOME_ZONES.map((z) => [z.key, z]));

export function findZone(key: string | null | undefined): DeliveryZone | null {
  if (!key) return null;
  return BY_KEY.get(key) ?? null;
}

export function isCovered(key: string | null | undefined): boolean {
  return findZone(key) !== null;
}

// ── Tarif ────────────────────────────────────────────────────
const BASE_FEE = 500; // FCFA, prise en charge Grand Lomé (moto)
const PER_RING = 350; // par anneau d'écart
const MIN_FEE = 500;
const MAX_FEE = 1600;

export type FeeEstimate = {
  covered: boolean;
  /** FCFA — estimation, jamais un prix ferme */
  amount: number;
  currency: 'XOF';
  etaMinutes: number;
  fromLabel: string;
  toLabel: string;
};

/**
 * Estime le tarif d'une course d'enlèvement (quartier vendeur) vers
 * livraison (quartier acheteur). Si l'un des deux quartiers n'est pas
 * couvert, `covered: false` et le reste est neutre.
 */
export function estimateFee(fromKey: string | null | undefined, toKey: string | null | undefined): FeeEstimate {
  const from = findZone(fromKey);
  const to = findZone(toKey);
  if (!from || !to) {
    return {
      covered: false,
      amount: 0,
      currency: 'XOF',
      etaMinutes: 0,
      fromLabel: from?.label ?? '—',
      toLabel: to?.label ?? '—',
    };
  }
  const ringDiff = Math.abs(from.ring - to.ring);
  const raw = BASE_FEE + ringDiff * PER_RING + (from.ring + to.ring) * 60;
  const amount = Math.min(MAX_FEE, Math.max(MIN_FEE, Math.round(raw / 50) * 50));
  const etaMinutes = 18 + ringDiff * 12 + (from.ring + to.ring) * 4;
  return {
    covered: true,
    amount,
    currency: 'XOF',
    etaMinutes,
    fromLabel: from.label,
    toLabel: to.label,
  };
}
