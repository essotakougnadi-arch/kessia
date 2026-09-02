// ============================================================
// KESSIA — KPI plateforme (§28, §54) : contrat de forme + invariants
//
// `computePlatformAnalytics()` agrège ~40 requêtes. Ce test le lance
// CONTRE LA VRAIE BASE (seed de dev/test) et vérifie :
//   1. la forme complète du résultat (toutes les clés, bons types) ;
//   2. les invariants métier (pourcentages 0–100, fenêtres 7j ≤ 30j,
//      Σ des répartitions = total, aucun agrégat négatif) ;
//   3. la réactivité : un nouvel utilisateur + un dépôt COMPLETED
//      font bouger `total` et `activated` d'exactement +1.
// Aucune donnée nominative ne doit sortir (agrégats uniquement).
// ============================================================

import { describe, it, expect, afterAll } from 'vitest';
import { computePlatformAnalytics } from '@/lib/analytics/platform';
import { createLedgerEntry } from '@/lib/ledger/ledger.service';
import { prisma, makeUser, cleanup, settle, tag } from './helpers';

const userIds: string[] = [];
afterAll(async () => {
  await settle();
  await cleanup({ userIds: userIds.splice(0) });
});

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function pct(v: number | null) {
  if (v === null) return;
  expect(v).toBeGreaterThanOrEqual(0);
  expect(v).toBeLessThanOrEqual(100);
}

describe('computePlatformAnalytics — intégration', () => {
  it('retourne un agrégat complet, bien typé et sans valeur aberrante', async () => {
    const a = await computePlatformAnalytics();

    // ── generatedAt ──
    expect(() => new Date(a.generatedAt).toISOString()).not.toThrow();
    expect(new Date(a.generatedAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    // ── users ──
    for (const k of ['total', 'verified', 'last7d', 'last30d', 'activated', 'activatedRate', 'active7d', 'active30d'] as const) {
      expect(isFiniteNumber(a.users[k]), `users.${k}`).toBe(true);
      expect(a.users[k], `users.${k} ≥ 0`).toBeGreaterThanOrEqual(0);
    }
    expect(a.users.verified).toBeLessThanOrEqual(a.users.total);
    expect(a.users.last7d).toBeLessThanOrEqual(a.users.last30d);
    expect(a.users.active7d).toBeLessThanOrEqual(a.users.active30d);
    expect(a.users.activated).toBeLessThanOrEqual(a.users.total);
    pct(a.users.activatedRate);
    pct(a.users.stickiness);
    expect(a.users.stickiness === null || isFiniteNumber(a.users.stickiness)).toBe(true);
    // répartitions : somme cohérente avec le total
    expect(Array.isArray(a.users.byType)).toBe(true);
    const kycSum = a.users.kycFunnel.reduce((s, r) => s + r.count, 0);
    expect(kycSum).toBe(a.users.total);
    for (const r of a.users.kycFunnel) expect(r.count).toBeGreaterThan(0);

    // ── wallet / finance ──
    for (const k of ['totalHeld', 'volume30d', 'txCount30d', 'depositVolume30d'] as const) {
      expect(isFiniteNumber(a.wallet[k]), `wallet.${k}`).toBe(true);
      expect(a.wallet[k]).toBeGreaterThanOrEqual(0);
    }
    for (const k of ['feesEarned30d', 'feesEarnedTotal', 'depositVolume30d', 'withdrawalVolume30d', 'transferVolume30d', 'payoutVolume30d', 'avgUserBalance'] as const) {
      expect(isFiniteNumber(a.finance[k]), `finance.${k}`).toBe(true);
      expect(a.finance[k]).toBeGreaterThanOrEqual(0);
    }
    expect(a.finance.netInflow30d).toBe(a.finance.depositVolume30d - a.finance.withdrawalVolume30d);
    expect(a.finance.feesEarned30d).toBeLessThanOrEqual(a.finance.feesEarnedTotal);
    expect(a.wallet.depositVolume30d).toBe(a.finance.depositVolume30d);

    // ── ai ──
    for (const k of ['conversations', 'conversations30d', 'messages30d', 'usersEngaged30d'] as const) {
      expect(a.ai[k]).toBeGreaterThanOrEqual(0);
    }
    expect(a.ai.conversations30d).toBeLessThanOrEqual(a.ai.conversations);
    const mix = a.ai.answerMix;
    for (const k of ['data', 'kb', 'fallback', 'unknown'] as const) pct(mix[k]);
    const mixSum = mix.data + mix.kb + mix.fallback + mix.unknown;
    // soit aucune réponse assistant sur 30j (tout à 0), soit somme ≈ 100 (arrondis)
    expect(mixSum === 0 || Math.abs(mixSum - 100) <= 2).toBe(true);

    // ── tontines ──
    expect(a.tontines.total).toBeGreaterThanOrEqual(0);
    expect(a.tontines.byStatus.reduce((s, r) => s + r.count, 0)).toBe(a.tontines.total);
    expect(a.tontines.byType.reduce((s, r) => s + r.count, 0)).toBe(a.tontines.total);
    expect(a.tontines.potInPlay).toBeGreaterThanOrEqual(0);
    expect(a.tontines.escrowHeld).toBeGreaterThanOrEqual(0);
    pct(a.tontines.contributionOnTimeRate);

    // ── business / risk / growth ──
    for (const k of ['activities', 'sales30d', 'salesVolume30d', 'expenseVolume30d', 'invoicesOutstanding'] as const) {
      expect(a.business[k]).toBeGreaterThanOrEqual(0);
    }
    for (const k of ['fraudAlertsOpen', 'guaranteeClaimsPending', 'lateContributions'] as const) {
      expect(a.risk[k]).toBeGreaterThanOrEqual(0);
    }
    expect(a.growth.stepsDone).toBeGreaterThanOrEqual(0);
    expect(a.growth.plansActive).toBeGreaterThanOrEqual(0);

    // ── timeseries : exactement 30 buckets jour, ordonnés, non négatifs ──
    expect(a.timeseries).toHaveLength(30);
    for (let i = 1; i < a.timeseries.length; i++) {
      expect(a.timeseries[i].day > a.timeseries[i - 1].day).toBe(true);
    }
    for (const b of a.timeseries) {
      expect(b.signups).toBeGreaterThanOrEqual(0);
      expect(b.txVolume).toBeGreaterThanOrEqual(0);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(b.day)).toBe(true);
    }
    const seriesSignups = a.timeseries.reduce((s, b) => s + b.signups, 0);
    expect(seriesSignups).toBeLessThanOrEqual(a.users.last30d);
  }, 60_000);

  it('un nouvel utilisateur + un dépôt COMPLETED incrémentent total et activated de +1', async () => {
    const before = await computePlatformAnalytics();

    const u = await makeUser({ balance: 0, kycStatus: 'NOT_STARTED' });
    userIds.push(u.id);

    // avant le dépôt : +1 utilisateur, pas encore « activé »
    const mid = await computePlatformAnalytics();
    expect(mid.users.total).toBe(before.users.total + 1);
    expect(mid.users.activated).toBe(before.users.activated);

    const dep = await createLedgerEntry({
      walletId: u.walletId,
      type: 'DEPOSIT',
      direction: 'CREDIT',
      amount: 25_000,
      description: 'IT platform deposit',
      idempotencyKey: `itest-platform-${tag()}`,
    });
    expect(dep.success).toBe(true);

    const after = await computePlatformAnalytics();
    expect(after.users.total).toBe(before.users.total + 1);
    expect(after.users.activated).toBe(before.users.activated + 1);
    expect(after.wallet.totalHeld).toBe(before.wallet.totalHeld + 25_000);
    expect(after.finance.depositVolume30d).toBe(before.finance.depositVolume30d + 25_000);
  }, 60_000);
});
