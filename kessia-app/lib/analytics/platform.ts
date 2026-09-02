// ============================================================
// KESSIA — Data & Analytics : plateforme (cahier des charges §28, §54)
//
// KPI agrégés pour le back-office. Toutes les valeurs proviennent
// de la base ; aucun chiffre inventé. Pas de données nominatives
// dans le résultat (agrégats uniquement).
// ============================================================

import prisma from '@/lib/db/prisma';
import type { UserType, TontineType, TontineStatus, KycStatus, AiContext } from '@prisma/client';

const DAY = 86_400_000;

export type PlatformAnalytics = {
  generatedAt: string;
  users: {
    total: number;
    verified: number;
    last7d: number;
    last30d: number;
    byType: Array<{ type: UserType; count: number }>;
    /** entonnoir KYC : répartition par statut */
    kycFunnel: Array<{ status: KycStatus; count: number }>;
    /** a réalisé ≥ 1 action structurante (dépôt / tontine / business) */
    activated: number;
    activatedRate: number;
    /** connexion dans les 7 / 30 derniers jours */
    active7d: number;
    active30d: number;
    /** active7d / active30d, proxy d'assiduité */
    stickiness: number | null;
  };
  wallet: {
    totalHeld: number;
    volume30d: number;
    txCount30d: number;
    depositVolume30d: number;
  };
  finance: {
    /** revenu KESSIA : Σ écritures FEE */
    feesEarned30d: number;
    feesEarnedTotal: number;
    depositVolume30d: number;
    withdrawalVolume30d: number;
    /** dépôts − retraits : flux net entrant dans le système */
    netInflow30d: number;
    /** transferts P2P entre membres */
    transferVolume30d: number;
    /** versements de tontine crédités aux membres */
    payoutVolume30d: number;
    /** solde moyen par compte utilisateur */
    avgUserBalance: number;
  };
  ai: {
    conversations: number;
    conversations30d: number;
    messages30d: number;
    /** utilisateurs distincts ayant ouvert une conversation (30 j) */
    usersEngaged30d: number;
    byContext: Array<{ context: AiContext; count: number }>;
    /** origine des réponses de l'assistant (30 j) : données / KB / repli */
    answerMix: { data: number; kb: number; fallback: number; unknown: number };
  };
  tontines: {
    total: number;
    byStatus: Array<{ status: TontineStatus; count: number }>;
    byType: Array<{ type: TontineType; count: number }>;
    /** estimation : Σ cotisation × membres des tontines actives */
    potInPlay: number;
    /** réel : Σ solde des comptes séquestre (argent effectivement détenu) */
    escrowHeld: number;
    contributionOnTimeRate: number | null;
  };
  business: {
    activities: number;
    sales30d: number;
    salesVolume30d: number;
    expenseVolume30d: number;
    invoicesOutstanding: number;
  };
  risk: {
    fraudAlertsOpen: number;
    guaranteeClaimsPending: number;
    lateContributions: number;
  };
  growth: {
    stepsDone: number;
    plansActive: number;
  };
  timeseries: Array<{ day: string; signups: number; txVolume: number }>;
};

const USER_LEDGER = { wallet: { kind: 'USER' as const } };

export async function computePlatformAnalytics(): Promise<PlatformAnalytics> {
  const now = Date.now();
  const d7 = new Date(now - 7 * DAY);
  const d30 = new Date(now - 30 * DAY);
  const completed30 = { status: 'COMPLETED' as const, createdAt: { gte: d30 }, ...USER_LEDGER };

  const sum = (agg: { _sum: { amount: unknown } }) => Math.round(Number(agg._sum.amount ?? 0));

  const [
    usersTotal, usersVerified, users7, users30, usersByType,
    kycFunnel, activatedUsers, active7d, active30d,
    walletAgg, ledger30, deposits30, withdrawals30, transfers30, payouts30, fees30, feesAll,
    tontinesTotal, tontineStatus, tontineType, potRows, contribs,
    bizCount, sales30, expenses30, invoicesOpen,
    fraudOpen, guaranteePending, lateContrib,
    growthDone, growthActive,
    aiConvTotal, aiConv30, aiMsg30, aiConvUsers30, aiByContext, aiAnswerRows,
    signupRows, txRows, escrowAgg,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { kycStatus: 'VERIFIED' } }),
    prisma.user.count({ where: { createdAt: { gte: d7 } } }),
    prisma.user.count({ where: { createdAt: { gte: d30 } } }),
    prisma.userProfile.groupBy({ by: ['userType'], _count: true }),
    prisma.user.groupBy({ by: ['kycStatus'], _count: true }),
    prisma.user.count({
      where: {
        OR: [
          { wallet: { entries: { some: { type: 'DEPOSIT', status: 'COMPLETED' } } } },
          { tontineMembers: { some: { status: 'ACTIVE' } } },
          { businesses: { some: {} } },
        ],
      },
    }),
    prisma.user.count({ where: { lastLoginAt: { gte: d7 } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: d30 } } }),
    prisma.wallet.aggregate({ where: { kind: 'USER' }, _sum: { balance: true } }),
    // volume « ressenti » = mouvements sur wallets USER (une jambe par opération)
    prisma.ledgerEntry.aggregate({ where: completed30, _sum: { amount: true }, _count: true }),
    prisma.ledgerEntry.aggregate({ where: { ...completed30, type: 'DEPOSIT' }, _sum: { amount: true } }),
    prisma.ledgerEntry.aggregate({ where: { ...completed30, type: 'WITHDRAWAL' }, _sum: { amount: true } }),
    prisma.ledgerEntry.aggregate({ where: { ...completed30, type: 'TRANSFER_OUT' }, _sum: { amount: true } }),
    prisma.ledgerEntry.aggregate({ where: { ...completed30, type: 'TONTINE_PAYOUT' }, _sum: { amount: true } }),
    prisma.ledgerEntry.aggregate({ where: { ...completed30, type: 'FEE' }, _sum: { amount: true } }),
    prisma.ledgerEntry.aggregate({ where: { status: 'COMPLETED', type: 'FEE' }, _sum: { amount: true } }),
    prisma.tontine.count(),
    prisma.tontine.groupBy({ by: ['status'], _count: true }),
    prisma.tontine.groupBy({ by: ['type'], _count: true }),
    prisma.tontine.findMany({ where: { status: 'ACTIVE' }, select: { amount: true, _count: { select: { members: true } } } }),
    prisma.tontineContribution.findMany({ where: { status: { in: ['PAID', 'LATE'] } }, select: { status: true, paidAt: true, dueDate: true } }),
    prisma.business.count({ where: { status: 'ACTIVE' } }),
    prisma.sale.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: d30 } }, _sum: { totalAmount: true }, _count: true }),
    prisma.expense.aggregate({ where: { createdAt: { gte: d30 } }, _sum: { amount: true } }),
    prisma.invoice.count({ where: { kind: 'INVOICE', status: { in: ['SENT', 'OVERDUE'] } } }),
    prisma.fraudAlert.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } }),
    prisma.guaranteeClaim.count({ where: { status: 'PENDING' } }),
    prisma.tontineContribution.count({ where: { status: 'LATE' } }),
    prisma.growthStepState.count({ where: { status: 'DONE' } }),
    prisma.growthStepState.groupBy({ by: ['userId'], where: { status: { in: ['TODO', 'DOING'] } } }),
    prisma.aiConversation.count(),
    prisma.aiConversation.count({ where: { createdAt: { gte: d30 } } }),
    prisma.aiMessage.count({ where: { createdAt: { gte: d30 } } }),
    prisma.aiConversation.groupBy({ by: ['userId'], where: { createdAt: { gte: d30 } } }),
    prisma.aiConversation.groupBy({ by: ['context'], _count: true }),
    prisma.aiMessage.findMany({
      where: { role: 'ASSISTANT', createdAt: { gte: d30 } },
      select: { metadata: true },
    }),
    prisma.user.findMany({ where: { createdAt: { gte: d30 } }, select: { createdAt: true } }),
    prisma.ledgerEntry.findMany({ where: completed30, select: { createdAt: true, amount: true } }),
    prisma.wallet.aggregate({ where: { kind: 'TONTINE_ESCROW' }, _sum: { balance: true } }),
  ]);

  const onTime = contribs.filter((c) => c.status === 'PAID' && c.paidAt && c.paidAt <= c.dueDate).length;
  const contributionOnTimeRate = contribs.length > 0 ? Math.round((onTime / contribs.length) * 100) : null;

  const potInPlay = potRows.reduce((s, t) => s + Number(t.amount) * t._count.members, 0);

  const depositVolume30d = sum(deposits30);
  const withdrawalVolume30d = sum(withdrawals30);

  const answerMix = { data: 0, kb: 0, fallback: 0, unknown: 0 };
  for (const m of aiAnswerRows) {
    const src = (m.metadata as { source?: string } | null)?.source;
    if (src === 'data') answerMix.data += 1;
    else if (src === 'kb') answerMix.kb += 1;
    else if (src === 'fallback') answerMix.fallback += 1;
    else answerMix.unknown += 1;
  }
  const answered = aiAnswerRows.length || 1;
  const asPct = (n: number) => Math.round((n / answered) * 100);

  // Timeseries jour par jour sur 30 j
  const bucketMap = new Map<string, { signups: number; txVolume: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    bucketMap.set(d.toISOString().slice(0, 10), { signups: 0, txVolume: 0 });
  }
  for (const u of signupRows) {
    const b = bucketMap.get(u.createdAt.toISOString().slice(0, 10)); if (b) b.signups += 1;
  }
  for (const t of txRows) {
    const b = bucketMap.get(t.createdAt.toISOString().slice(0, 10)); if (b) b.txVolume += Number(t.amount);
  }

  return {
    generatedAt: new Date(now).toISOString(),
    users: {
      total: usersTotal, verified: usersVerified, last7d: users7, last30d: users30,
      byType: usersByType.map((r) => ({ type: r.userType, count: r._count })).sort((a, b) => b.count - a.count),
      kycFunnel: kycFunnel.map((r) => ({ status: r.kycStatus, count: r._count })),
      activated: activatedUsers,
      activatedRate: usersTotal > 0 ? Math.round((activatedUsers / usersTotal) * 100) : 0,
      active7d, active30d,
      stickiness: active30d > 0 ? Math.round((active7d / active30d) * 100) : null,
    },
    wallet: {
      totalHeld: Math.round(Number(walletAgg._sum.balance ?? 0)),
      volume30d: sum(ledger30),
      txCount30d: ledger30._count,
      depositVolume30d,
    },
    finance: {
      feesEarned30d: sum(fees30),
      feesEarnedTotal: sum(feesAll),
      depositVolume30d,
      withdrawalVolume30d,
      netInflow30d: depositVolume30d - withdrawalVolume30d,
      transferVolume30d: sum(transfers30),
      payoutVolume30d: sum(payouts30),
      avgUserBalance:
        usersTotal > 0 ? Math.round(Number(walletAgg._sum.balance ?? 0) / usersTotal) : 0,
    },
    ai: {
      conversations: aiConvTotal,
      conversations30d: aiConv30,
      messages30d: aiMsg30,
      usersEngaged30d: aiConvUsers30.length,
      byContext: aiByContext.map((r) => ({ context: r.context, count: r._count })),
      answerMix: {
        data: asPct(answerMix.data),
        kb: asPct(answerMix.kb),
        fallback: asPct(answerMix.fallback),
        unknown: asPct(answerMix.unknown),
      },
    },
    tontines: {
      total: tontinesTotal,
      byStatus: tontineStatus.map((r) => ({ status: r.status, count: r._count })),
      byType: tontineType.map((r) => ({ type: r.type, count: r._count })),
      potInPlay: Math.round(potInPlay),
      escrowHeld: Math.round(Number(escrowAgg._sum.balance ?? 0)),
      contributionOnTimeRate,
    },
    business: {
      activities: bizCount,
      sales30d: sales30._count,
      salesVolume30d: Math.round(Number(sales30._sum.totalAmount ?? 0)),
      expenseVolume30d: Math.round(Number(expenses30._sum.amount ?? 0)),
      invoicesOutstanding: invoicesOpen,
    },
    risk: {
      fraudAlertsOpen: fraudOpen,
      guaranteeClaimsPending: guaranteePending,
      lateContributions: lateContrib,
    },
    growth: { stepsDone: growthDone, plansActive: growthActive.length },
    timeseries: [...bucketMap.entries()].map(([day, v]) => ({ day, signups: v.signups, txVolume: Math.round(v.txVolume) })),
  };
}
