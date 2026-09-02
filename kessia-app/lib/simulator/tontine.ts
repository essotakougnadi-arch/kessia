// ============================================================
// KESSIA — Simulateur de tontine (cahier des charges §20, §6.4)
//
// Projette le déroulé d'une tontine selon son type : ce que je verse,
// ce que je reçois, à quel tour, et le calendrier. PUR et déterministe.
// Réutilise les mécaniques de distribution de lib/tontine/type-meta.
// ============================================================

import type { TontineType, TontineFrequency } from '@prisma/client';
import { tontineTypeMeta, totalRoundsForType } from '@/lib/tontine/type-meta';
import { addFrequencyN } from '@/lib/tontine/schedule';

export type TontineSimInput = {
  type: TontineType;
  /** cotisation par membre et par tour */
  amount: number;
  /** nombre de membres */
  members: number;
  frequency: TontineFrequency;
  /** ma position dans l'ordre de passage (1-indexée) */
  myPosition: number;
  /** date de démarrage (défaut : aujourd'hui) */
  startDate?: Date;
};

export type TontineSimRound = {
  round: number;
  dueDate: string;
  /** montant que je verse ce tour */
  iPay: number;
  /** montant que je reçois ce tour */
  iReceive: number;
  /** solde net cumulé de mon point de vue (négatif = j'ai plus versé que reçu) */
  cumulativeNet: number;
  /** bénéficiaire du tour (position), null pour une tontine Croissance */
  beneficiaryPosition: number | null;
  isMyPayout: boolean;
};

export type TontineSimResult = {
  distribution: 'rotating' | 'project' | 'growth';
  typeLabel: string;
  totalRounds: number;
  potPerRound: number;
  rounds: TontineSimRound[];
  myTotalPaid: number;
  myTotalReceived: number;
  /** tour où je touche la cagnotte (rotating) / ma mise (growth) / null si je suis l'organisateur d'un Projet que je ne finance pas */
  myPayoutRound: number | null;
  /** ma position saisie (rotating) */
  myPosition: number;
  /** « intérêt implicite » : recevoir tôt = avance de trésorerie, recevoir tard = épargne forcée */
  positionNote: string;
  /** clé i18n de `positionNote` — le libellé est reconstruit côté écran (§38) */
  positionKind:
    | 'growth'
    | 'projectOrganizer'
    | 'projectContributor'
    | 'rotatingEarly'
    | 'rotatingLate'
    | 'rotatingMid';
};

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n || 0)));
}

export function simulateTontine(input: TontineSimInput): TontineSimResult {
  const meta = tontineTypeMeta(input.type);
  const members = clampInt(input.members, 2, 30);
  const amount = Math.max(0, Math.round(input.amount || 0));
  const totalRounds = totalRoundsForType(input.type, members);
  const myPosition = clampInt(input.myPosition, 1, members);
  const start = input.startDate ?? new Date();
  const potPerRound = amount * members;

  const rounds: TontineSimRound[] = [];
  let cumulativeNet = 0;
  let myTotalPaid = 0;
  let myTotalReceived = 0;
  let myPayoutRound: number | null = null;

  for (let r = 1; r <= totalRounds; r++) {
    const dueDate = addFrequencyN(start, input.frequency, r - 1);

    let iPay = 0;
    let iReceive = 0;
    let beneficiaryPosition: number | null = null;

    if (meta.distribution === 'rotating') {
      iPay = amount;
      beneficiaryPosition = r; // la position r reçoit au tour r
      if (r === myPosition) {
        iReceive = potPerRound;
        myPayoutRound = r;
      }
    } else if (meta.distribution === 'project') {
      // chaque membre contribue une fois ; l'organisateur (position 1) reçoit tout à la fin
      iPay = amount;
      beneficiaryPosition = 1;
      if (myPosition === 1) {
        iReceive = potPerRound; // tout en un tour
        myPayoutRound = r;
      }
    } else {
      // growth : chacun cotise à chaque tour, récupère sa mise totale au dernier tour
      iPay = amount;
      beneficiaryPosition = null;
      if (r === totalRounds) {
        iReceive = amount * totalRounds;
        myPayoutRound = r;
      }
    }

    myTotalPaid += iPay;
    myTotalReceived += iReceive;
    cumulativeNet += iReceive - iPay;

    rounds.push({
      round: r,
      dueDate: dueDate.toISOString(),
      iPay,
      iReceive,
      cumulativeNet,
      beneficiaryPosition,
      isMyPayout: iReceive > 0,
    });
  }

  let positionNote: string;
  let positionKind: TontineSimResult['positionKind'];
  if (meta.distribution === 'growth') {
    positionKind = 'growth';
    positionNote = `Épargne forcée : vous versez ${amount.toLocaleString('fr-FR')} FCFA à chaque tour et récupérez ${(amount * totalRounds).toLocaleString('fr-FR')} FCFA au dernier tour.`;
  } else if (meta.distribution === 'project') {
    positionKind = myPosition === 1 ? 'projectOrganizer' : 'projectContributor';
    positionNote = myPosition === 1
      ? `En tant qu'organisateur, vous recevez la cagnotte de ${potPerRound.toLocaleString('fr-FR')} FCFA pour réaliser le projet du groupe.`
      : `Vous contribuez ${amount.toLocaleString('fr-FR')} FCFA au projet porté par l'organisateur.`;
  } else if (myPosition <= Math.ceil(members / 3)) {
    positionKind = 'rotatingEarly';
    positionNote = `Position ${myPosition}/${members} : vous recevez tôt — c'est une avance de trésorerie que vous remboursez ensuite tour après tour.`;
  } else if (myPosition >= members - Math.floor(members / 3)) {
    positionKind = 'rotatingLate';
    positionNote = `Position ${myPosition}/${members} : vous recevez tard — la tontine agit alors comme une épargne forcée sur ${totalRounds} échéances.`;
  } else {
    positionKind = 'rotatingMid';
    positionNote = `Position ${myPosition}/${members} : vous recevez au milieu du cycle, un bon équilibre entre avance et épargne.`;
  }

  return {
    // Le simulateur ne couvre que les tontines de groupe ; `tontineTypeMeta`
    // ne renvoie jamais 'solo' (cela vient de `resolveDistribution`).
    distribution: meta.distribution === 'solo' ? 'rotating' : meta.distribution,
    typeLabel: meta.label,
    totalRounds,
    potPerRound,
    rounds,
    myTotalPaid,
    myTotalReceived,
    myPayoutRound,
    myPosition,
    positionNote,
    positionKind,
  };
}
