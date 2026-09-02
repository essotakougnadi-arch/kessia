// ============================================================
// KESSIA — Contrat numérique de tontine · « Smart Agreement » (§6.4)
//
// Snapshot immuable des termes d'une tontine, figé à l'activation :
// règles, membres, calendrier, obligations. Ce n'est PAS une
// blockchain — c'est un document horodaté, versionné, accepté par
// chaque membre et adossé au journal d'événements (`TontineEvent`).
//
// Pur, sans I/O.
// ============================================================

import { Prisma, type TontineFrequency, type TontineType, type PurchaseMode } from '@prisma/client';
import { TONTINE_FREQ_LABELS } from '@/lib/utils/format';
import { tontineTypeMeta, resolveDistribution, type DistributionMode } from './type-meta';
import { addFrequencyN } from './schedule';

export const AGREEMENT_VERSION = 1;

export type AgreementMemberInput = {
  userId: string;
  orderPosition: number | null;
  joinedAt: Date;
  user: { firstName: string; lastName: string };
};

export type AgreementTontineInput = {
  id: string;
  name: string;
  description: string | null;
  type: TontineType;
  purchaseMode?: PurchaseMode | null;
  purchaseItem?: string | null;
  targetAmount?: Prisma.Decimal | number | null;
  amount: Prisma.Decimal | number;
  currency: string;
  frequency: TontineFrequency;
  startDate: Date;
  totalRounds: number;
  rules: string | null;
};

export type AgreementTerms = {
  version: number;
  generatedAt: string;
  tontine: {
    id: string;
    name: string;
    objet: string;
    type: TontineType;
    typeLabel: string;
    distribution: DistributionMode;
  };
  finance: {
    contribution: number;
    currency: string;
    frequency: TontineFrequency;
    frequencyLabel: string;
    memberCount: number;
    totalRounds: number;
    potPerRound: number;
    engagementTotal: number;
  };
  calendar: {
    startDate: string;
    endDateEstimate: string;
    rounds: Array<{ round: number; dueDate: string; beneficiary: string | null }>;
  };
  members: Array<{ position: number; name: string; joinedAt: string }>;
  rules: {
    cotisation: string;
    retard: string;
    distribution: string;
    sortie: string;
    gouvernance: string;
    personnalisees: string | null;
  };
};

function n(v: Prisma.Decimal | number): number {
  return typeof v === 'number' ? v : Number(v);
}

export function buildAgreementTerms(
  tontine: AgreementTontineInput,
  members: AgreementMemberInput[],
  now: Date = new Date()
): AgreementTerms {
  const meta = tontineTypeMeta(tontine.type);
  const distribution = resolveDistribution(tontine.type, tontine.purchaseMode);
  const amount = n(tontine.amount);
  const ordered = [...members].sort(
    (a, b) => (a.orderPosition ?? 999) - (b.orderPosition ?? 999) || a.joinedAt.getTime() - b.joinedAt.getTime()
  );
  const memberCount = ordered.length;
  const pot = amount * memberCount;
  const start = new Date(Math.max(now.getTime(), new Date(tontine.startDate).getTime()));

  const rounds = Array.from({ length: tontine.totalRounds }, (_, i) => {
    const round = i + 1;
    const dueDate = round === 1 ? start : addFrequencyN(start, tontine.frequency, round - 1);
    let beneficiary: string | null = null;
    if (distribution === 'rotating') {
      const m = ordered[round - 1];
      beneficiary = m ? `${m.user.firstName} ${m.user.lastName}` : null;
    } else if (distribution === 'project') {
      const m = ordered[0];
      beneficiary = m ? `${m.user.firstName} ${m.user.lastName} (organisateur)` : null;
    } else if (distribution === 'solo') {
      const m = ordered[0];
      beneficiary = round === tontine.totalRounds
        ? (m ? `${m.user.firstName} ${m.user.lastName} — déblocage de l'épargne` : null)
        : 'Aucun versement — épargne en séquestre';
    } else {
      beneficiary = 'Restitution à chaque membre en fin de cycle';
    }
    return { round, dueDate: dueDate.toISOString(), beneficiary };
  });

  const endEstimate = rounds.length ? rounds[rounds.length - 1].dueDate : start.toISOString();
  const freqLabel = TONTINE_FREQ_LABELS[tontine.frequency];

  const soloTotal = amount * tontine.totalRounds;
  const distributionRule =
    distribution === 'rotating'
      ? `À chaque échéance, le membre dont c'est le tour reçoit la totalité de la cagnotte (${pot.toLocaleString('fr-FR')} ${cur(tontine.currency)}). Chaque membre reçoit une fois, dans l'ordre défini ci-dessus.`
      : distribution === 'project'
        ? `Les cotisations sont collectées en une fois. Lorsque tous les membres ont contribué, la totalité de la cagnotte (${pot.toLocaleString('fr-FR')} ${cur(tontine.currency)}) est versée à l'organisateur, qui exécute le projet pour le compte du groupe.`
        : distribution === 'solo'
          ? `Achat individuel${tontine.purchaseItem ? ` (${tontine.purchaseItem})` : ''} : aucun versement pendant le plan. Chaque échéance est détenue sur le compte séquestre de la tontine. Au dernier versement, la totalité de l'épargne (${soloTotal.toLocaleString('fr-FR')} ${cur(tontine.currency)}) est recréditée sur votre wallet KESSIA pour réaliser l'achat.`
          : `Aucun versement n'a lieu pendant le cycle : l'épargne est bloquée. En fin de cycle, chaque membre récupère l'intégralité de ce qu'il a versé.`;

  return {
    version: AGREEMENT_VERSION,
    generatedAt: now.toISOString(),
    tontine: {
      id: tontine.id,
      name: tontine.name,
      objet:
        tontine.description?.trim() ||
        (distribution === 'solo'
          ? `Plan d'achat individuel${tontine.purchaseItem ? ` — ${tontine.purchaseItem}` : ''} « ${tontine.name} ».`
          : `Tontine ${meta.label.toLowerCase()} du groupe « ${tontine.name} ».`),
      type: tontine.type,
      typeLabel: meta.label,
      distribution,
    },
    finance: {
      contribution: amount,
      currency: tontine.currency,
      frequency: tontine.frequency,
      frequencyLabel: freqLabel,
      memberCount,
      totalRounds: tontine.totalRounds,
      potPerRound: pot,
      engagementTotal: amount * tontine.totalRounds,
    },
    calendar: { startDate: start.toISOString(), endDateEstimate: endEstimate, rounds },
    members: ordered.map((m, i) => ({
      position: m.orderPosition ?? i + 1,
      name: `${m.user.firstName} ${m.user.lastName}`,
      joinedAt: new Date(m.joinedAt).toISOString(),
    })),
    rules: {
      cotisation: `Chaque membre s'engage à verser ${amount.toLocaleString('fr-FR')} ${cur(tontine.currency)} à chaque échéance (${freqLabel.toLowerCase()}), depuis son wallet KESSIA, soit un engagement total de ${(amount * tontine.totalRounds).toLocaleString('fr-FR')} ${cur(tontine.currency)} sur ${tontine.totalRounds} tour(s).`,
      retard: tontine.rules?.trim()
        ? tontine.rules.trim()
        : `Une cotisation non réglée à l'échéance est marquée « en retard ». Le groupe est notifié et des rappels sont envoyés. Le membre concerné reste tenu de régulariser pour ne pas bloquer le tour.`,
      distribution: distributionRule,
      sortie: `Un membre ne peut quitter la tontine avant la fin du cycle qu'avec l'accord du groupe et après régularisation de ses cotisations. Une exclusion pour manquement grave est décidée par le gestionnaire et tracée.`,
      gouvernance: `Le créateur de la tontine en est le gestionnaire. Toute modification des règles pendant le cycle doit être portée à la connaissance de tous les membres. Chaque événement (adhésion, cotisation, versement, retard) est inscrit au journal de la tontine.`,
      personnalisees: tontine.rules?.trim() || null,
    },
  };
}

function cur(c: string): string {
  return c === 'XOF' || c === 'XAF' ? 'FCFA' : c;
}
