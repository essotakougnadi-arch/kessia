// ============================================================
// KESSIA Score — moteur de calcul (cahier des charges §10, §22)
//
// Modèle **à base de règles, transparent et déterministe** :
//   score = base 300 + Σ points des facteurs, borné à [0, 1000].
// Chaque facteur renvoie ses points, son maximum et une explication.
// Aucune pondération cachée, aucune donnée sensible utilisée.
//
// Ce score N'EST PAS un score de crédit réglementé. Il ne conditionne
// aucun octroi automatique de fonds (voir docs/compliance/matrix.md §5).
// ============================================================

import prisma from '@/lib/db/prisma';
import { serverT } from '@/lib/i18n/server';
import type { KessiaScore, ScoreBand, ScoreFactor } from './types';

const BASE = 300;
const MIN = 0;
const MAX = 1000;

function bandFor(score: number): ScoreBand {
  if (score >= 850) return 'EXEMPLAIRE';
  if (score >= 700) return 'TRES_FIABLE';
  if (score >= 550) return 'FIABLE';
  if (score >= 400) return 'EN_CONSTRUCTION';
  return 'NOUVEAU';
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function monthsBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

export async function computeKessiaScore(userId: string): Promise<KessiaScore> {
  const now = new Date();
  const t = serverT();
  const bandLabelFor = (b: ScoreBand) => t(`srvScore.band.${b}`);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      kycStatus: true,
      kycLevel: true,
      twoFactorEnabled: true,
      wallet: { select: { isLocked: true } },
    },
  });
  if (!user) {
    // Utilisateur introuvable → score plancher explicite
    return {
      score: MIN,
      band: 'NOUVEAU',
      bandLabel: bandLabelFor('NOUVEAU'),
      factors: [],
      advice: [],
      generatedAt: now.toISOString(),
    };
  }

  const [ledgerCount, tontineMemberships, contributions, businesses, sales] = await Promise.all([
    prisma.ledgerEntry.count({ where: { wallet: { userId }, status: 'COMPLETED' } }),
    prisma.tontineMember.findMany({
      where: { userId },
      select: { status: true },
    }),
    prisma.tontineContribution.findMany({
      where: { member: { userId } },
      select: { status: true, dueDate: true, paidAt: true },
    }),
    prisma.business.count({ where: { userId, status: 'ACTIVE' } }),
    prisma.sale.count({ where: { business: { userId } } }),
  ]);

  const factors: ScoreFactor[] = [];

  // ── 1. Identité vérifiée (KYC) — max 200 ─────────────────────
  {
    const max = 200;
    let points = 0;
    let detail = t('srvScore.d.kycNone');
    if (user.kycStatus === 'VERIFIED') {
      points = 120 + clamp(user.kycLevel, 0, 2) * 40; // niveau 1→160, 2→200
      detail = t('srvScore.d.kycVerified', { level: user.kycLevel || 1 });
    } else if (user.kycStatus === 'UNDER_REVIEW') {
      points = 40;
      detail = t('srvScore.d.kycReview');
    } else if (user.kycStatus === 'IN_PROGRESS' || user.kycStatus === 'ACTION_REQUIRED') {
      points = 15;
      detail = t('srvScore.d.kycIncomplete');
    }
    factors.push({ key: 'kyc', label: t('srvScore.factor.kyc'), points: clamp(points, 0, max), max, detail });
  }

  // ── 2. Ancienneté du compte — max 100 ───────────────────────
  {
    const max = 100;
    const months = monthsBetween(user.createdAt, now);
    const points = Math.round(clamp(months, 0, 12) / 12 * max);
    factors.push({
      key: 'tenure',
      label: t('srvScore.factor.tenure'),
      points,
      max,
      detail: months < 1 ? t('srvScore.d.tenureThisMonth') : t('srvScore.d.tenureMonths', { months: Math.floor(months) }),
    });
  }

  // ── 3. Activité du wallet — max 120 ─────────────────────────
  {
    const max = 120;
    const points = Math.round(clamp(ledgerCount, 0, 30) / 30 * max);
    factors.push({
      key: 'wallet_activity',
      label: t('srvScore.factor.wallet_activity'),
      points,
      max,
      detail: t('srvScore.d.walletOps', { count: ledgerCount }),
    });
  }

  // ── 4. Fiabilité tontine — max 220 ──────────────────────────
  {
    const max = 220;
    const paid = contributions.filter((c) => c.status === 'PAID');
    const onTime = paid.filter((c) => c.paidAt && c.paidAt <= c.dueDate).length;
    const late = paid.length - onTime + contributions.filter((c) => c.status === 'LATE').length;
    let points = onTime * 25 - late * 20;
    points = clamp(points, -60, max);
    let detail = t('srvScore.d.tontineNone');
    if (paid.length > 0) {
      detail = late > 0
        ? t('srvScore.d.tontineWithLate', { onTime, late })
        : t('srvScore.d.tontineOnTime', { onTime });
    }
    factors.push({ key: 'tontine_reliability', label: t('srvScore.factor.tontine_reliability'), points, max, detail });
  }

  // ── 5. Participation aux tontines — max 60 ──────────────────
  {
    const max = 60;
    const active = tontineMemberships.filter((m) => m.status === 'ACTIVE').length;
    const points = clamp(active * 20, 0, max);
    factors.push({
      key: 'tontine_participation',
      label: t('srvScore.factor.tontine_participation'),
      points,
      max,
      detail: active === 0 ? t('srvScore.d.tontinePartNone') : t('srvScore.d.tontinePartActive', { count: active }),
    });
  }

  // ── 6. Activité entrepreneuriale — max 80 ───────────────────
  {
    const max = 80;
    let points = 0;
    let detail = t('srvScore.d.businessNone');
    if (businesses > 0) {
      points = 30 + clamp(sales, 0, 10) * 5;
      detail = t('srvScore.d.businessActive', { businesses, sales });
    }
    factors.push({ key: 'business', label: t('srvScore.factor.business'), points: clamp(points, 0, max), max, detail });
  }

  // ── 7. Hygiène de sécurité — max 40 ─────────────────────────
  {
    const max = 40;
    const points = user.twoFactorEnabled ? 40 : 0;
    factors.push({
      key: 'security',
      label: t('srvScore.factor.security'),
      points,
      max,
      detail: user.twoFactorEnabled ? t('srvScore.d.security2faOn') : t('srvScore.d.security2faOff'),
    });
  }

  // ── 8. Malus wallet verrouillé ─────────────────────────────
  if (user.wallet?.isLocked) {
    factors.push({
      key: 'wallet_locked',
      label: t('srvScore.factor.wallet_locked'),
      points: -80,
      max: 0,
      detail: t('srvScore.d.walletLocked'),
    });
  }

  // ── 9. Malus suspension tontine ────────────────────────────
  {
    const suspended = tontineMemberships.filter((m) => m.status === 'SUSPENDED' || m.status === 'REMOVED').length;
    if (suspended > 0) {
      factors.push({
        key: 'tontine_sanction',
        label: t('srvScore.factor.tontine_sanction'),
        points: -40 * suspended,
        max: 0,
        detail: t('srvScore.d.tontineSanction', { count: suspended }),
      });
    }
  }

  const raw = BASE + factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.round(clamp(raw, MIN, MAX));
  const band = bandFor(score);

  // ── Conseils : les 3 facteurs où il reste le plus à gagner ──
  const ADVICE_KEYS = new Set([
    'kyc', 'tenure', 'wallet_activity', 'tontine_reliability',
    'tontine_participation', 'business', 'security',
  ]);
  const advice = factors
    .filter((f) => f.max > 0 && f.points < f.max)
    .sort((a, b) => (b.max - b.points) - (a.max - a.points))
    .slice(0, 3)
    .map((f) => (ADVICE_KEYS.has(f.key) ? t(`srvScore.advice.${f.key}`) : ''));

  return {
    score,
    band,
    bandLabel: bandLabelFor(band),
    factors,
    advice: advice.filter(Boolean),
    generatedAt: now.toISOString(),
  };
}
