// ============================================================
// KESSIA — Plan de croissance : règles de génération (§23)
//
// PUR et déterministe. À partir d'un ensemble de signaux (KESSIA
// Score, ADN d'entreprise, tontines, KYC…), produit la liste des
// étapes recommandées : objectif → action → échéance → indicateur.
// La progression de l'utilisateur est gérée à part (GrowthStepState).
// ============================================================

import type { Translate } from '@/lib/i18n/core';

export type GrowthCategory = 'IDENTITE' | 'SECURITE' | 'EPARGNE' | 'TONTINE' | 'BUSINESS';

export function growthCategoryLabel(t: Translate, cat: GrowthCategory): string {
  return t(`srvGrowth.category.${cat}`);
}

export type GrowthStepDef = {
  key: string;
  category: GrowthCategory;
  title: string;
  /** pourquoi cette étape compte */
  why: string;
  actionLabel: string;
  actionUrl: string;
  /** indicateur de suivi affiché à l'utilisateur */
  metricLabel: string;
  /** cible à atteindre pour considérer l'étape « faite » */
  targetHint: string;
  /** poids pour le tri (points de Score potentiels ou impact estimé) */
  impact: number;
  /** échéance suggérée, en jours à partir d'aujourd'hui */
  dueInDays: number;
};

export type BusinessSignal = {
  id: string;
  name: string;
  salesCount30: number;
  grossMarginRate: number | null;
  lowStock: number;
  recurringCustomers: number;
  goalsCount: number;
  suppliersCount: number;
  openQuotes: number;
};

export type GrowthSignals = {
  kycVerified: boolean;
  kycStarted: boolean;
  twoFactorEnabled: boolean;
  walletOps: number;
  activeTontines: number;
  lateContributions: number;
  scoreBand: string;
  scoreToNextBand: number | null;
  businesses: BusinessSignal[];
};

export function buildGrowthSteps(s: GrowthSignals, t: Translate): GrowthStepDef[] {
  const steps: GrowthStepDef[] = [];
  const g = (k: string, vars?: Record<string, string | number>) => t(`srvGrowth.step.${k}`, vars);

  // ── Identité ────────────────────────────────────────────────
  if (!s.kycVerified) {
    steps.push({
      key: 'kyc-verify',
      category: 'IDENTITE',
      title: s.kycStarted ? g('kycFinishTitle') : g('kycStartTitle'),
      why: g('kycWhy'),
      actionLabel: g('kycAction'),
      actionUrl: '/profile/kyc',
      metricLabel: g('kycMetric'),
      targetHint: g('kycTarget'),
      impact: 200,
      dueInDays: 7,
    });
  }

  // ── Sécurité ────────────────────────────────────────────────
  if (!s.twoFactorEnabled) {
    steps.push({
      key: 'enable-2fa',
      category: 'SECURITE',
      title: g('twofaTitle'),
      why: g('twofaWhy'),
      actionLabel: g('twofaAction'),
      actionUrl: '/profile/security',
      metricLabel: g('twofaMetric'),
      targetHint: g('twofaTarget'),
      impact: 40,
      dueInDays: 5,
    });
  }

  // ── Épargne / wallet ────────────────────────────────────────
  if (s.walletOps < 10) {
    steps.push({
      key: 'wallet-regular',
      category: 'EPARGNE',
      title: g('walletTitle'),
      why: g('walletWhy'),
      actionLabel: g('walletAction'),
      actionUrl: '/wallet',
      metricLabel: g('walletMetric'),
      targetHint: g('walletTarget', { ops: s.walletOps }),
      impact: 60,
      dueInDays: 30,
    });
  }

  // ── Tontines ────────────────────────────────────────────────
  if (s.lateContributions > 0) {
    steps.push({
      key: 'tontine-catchup',
      category: 'TONTINE',
      title: g('catchupTitle'),
      why: g('catchupWhy', { count: s.lateContributions }),
      actionLabel: g('catchupAction'),
      actionUrl: '/tontine',
      metricLabel: g('catchupMetric'),
      targetHint: g('catchupTarget'),
      impact: 120,
      dueInDays: 3,
    });
  } else if (s.activeTontines === 0) {
    steps.push({
      key: 'tontine-join',
      category: 'TONTINE',
      title: g('joinTitle'),
      why: g('joinWhy'),
      actionLabel: g('joinAction'),
      actionUrl: '/tontine',
      metricLabel: g('joinMetric'),
      targetHint: g('joinTarget'),
      impact: 60,
      dueInDays: 14,
    });
  }

  // ── Activité (par entreprise) ──────────────────────────────
  if (s.businesses.length === 0) {
    steps.push({
      key: 'business-create',
      category: 'BUSINESS',
      title: g('bizCreateTitle'),
      why: g('bizCreateWhy'),
      actionLabel: g('bizCreateAction'),
      actionUrl: '/business?create=1',
      metricLabel: g('bizCreateMetric'),
      targetHint: g('bizCreateTarget'),
      impact: 50,
      dueInDays: 21,
    });
  }

  for (const b of s.businesses) {
    const p = (suffix: string) => `business-${b.id}-${suffix}`;
    if (b.salesCount30 < 4) {
      steps.push({
        key: p('record-sales'),
        category: 'BUSINESS',
        title: g('recordSalesTitle', { name: b.name }),
        why: g('recordSalesWhy'),
        actionLabel: g('recordSalesAction'),
        actionUrl: `/business/${b.id}?tab=ventes`,
        metricLabel: g('recordSalesMetric'),
        targetHint: g('recordSalesTarget', { count: b.salesCount30 }),
        impact: 40,
        dueInDays: 14,
      });
    }
    if (b.grossMarginRate !== null && b.grossMarginRate < 20) {
      steps.push({
        key: p('margin'),
        category: 'BUSINESS',
        title: g('marginTitle', { name: b.name }),
        why: g('marginWhy', { rate: b.grossMarginRate }),
        actionLabel: g('marginAction'),
        actionUrl: `/business/${b.id}?tab=adn`,
        metricLabel: g('marginMetric'),
        targetHint: g('marginTarget', { rate: b.grossMarginRate }),
        impact: 70,
        dueInDays: 30,
      });
    }
    if (b.lowStock > 0) {
      steps.push({
        key: p('restock'),
        category: 'BUSINESS',
        title: g('restockTitle', { name: b.name }),
        why: g('restockWhy', { count: b.lowStock }),
        actionLabel: g('restockAction'),
        actionUrl: `/business/${b.id}?tab=produits`,
        metricLabel: g('restockMetric'),
        targetHint: g('restockTarget', { count: b.lowStock }),
        impact: 35,
        dueInDays: 7,
      });
    }
    if (b.recurringCustomers < 3) {
      steps.push({
        key: p('loyalty'),
        category: 'BUSINESS',
        title: g('loyaltyTitle', { name: b.name }),
        why: g('loyaltyWhy'),
        actionLabel: g('loyaltyAction'),
        actionUrl: `/business/${b.id}?tab=clients`,
        metricLabel: g('loyaltyMetric'),
        targetHint: g('loyaltyTarget', { count: b.recurringCustomers }),
        impact: 30,
        dueInDays: 21,
      });
    }
    if (b.openQuotes > 0) {
      steps.push({
        key: p('quotes'),
        category: 'BUSINESS',
        title: g('quotesTitle', { name: b.name }),
        why: g('quotesWhy', { count: b.openQuotes }),
        actionLabel: g('quotesAction'),
        actionUrl: `/business/${b.id}?tab=factures`,
        metricLabel: g('quotesMetric'),
        targetHint: g('quotesTarget', { count: b.openQuotes }),
        impact: 45,
        dueInDays: 5,
      });
    }
    if (b.goalsCount === 0) {
      steps.push({
        key: p('goal'),
        category: 'BUSINESS',
        title: g('goalTitle', { name: b.name }),
        why: g('goalWhy'),
        actionLabel: g('goalAction'),
        actionUrl: `/business/${b.id}?tab=objectifs`,
        metricLabel: g('goalMetric'),
        targetHint: g('goalTarget'),
        impact: 25,
        dueInDays: 10,
      });
    }
    if (b.suppliersCount === 0) {
      steps.push({
        key: p('suppliers'),
        category: 'BUSINESS',
        title: g('suppliersTitle', { name: b.name }),
        why: g('suppliersWhy'),
        actionLabel: g('suppliersAction'),
        actionUrl: `/business/${b.id}?tab=fournisseurs`,
        metricLabel: g('suppliersMetric'),
        targetHint: g('suppliersTarget'),
        impact: 15,
        dueInDays: 21,
      });
    }
  }

  // ── Épargne dirigée (toujours proposée en dernier) ─────────
  steps.push({
    key: 'simulate-goal',
    category: 'EPARGNE',
    title: g('simulateTitle'),
    why: g('simulateWhy'),
    actionLabel: g('simulateAction'),
    actionUrl: '/simulator?sim=savings',
    metricLabel: g('simulateMetric'),
    targetHint: g('simulateTarget'),
    impact: 10,
    dueInDays: 30,
  });

  return steps;
}
