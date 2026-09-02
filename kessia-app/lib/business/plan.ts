// ============================================================
// KESSIA — Business Plan AI (cahier des charges §17)
//
// Génère un BROUILLON de plan d'affaires structuré à partir de
// l'ADN de l'entreprise (ventes, marge, clients, objectifs réels).
// Le propriétaire l'édite ensuite librement. Rien n'est inventé :
// les chiffres proviennent des données saisies dans l'application.
// ============================================================

import prisma from '@/lib/db/prisma';
import { computeBusinessDNA } from './dna';
import { computeTreasury } from './treasury';
import { computeGoalProgress } from './goals';
import { formatCurrency } from '@/lib/utils/format';
import { PLAN_SECTIONS, isBusinessPlanContent, type BusinessPlanContent } from './plan-shared';

export { PLAN_SECTIONS, isBusinessPlanContent };
export type { BusinessPlanContent };

function n(v: number): string {
  return formatCurrency(v);
}

export async function generateBusinessPlanDraft(businessId: string): Promise<BusinessPlanContent | null> {
  const [dna, treasury, goals, customers] = await Promise.all([
    computeBusinessDNA(businessId),
    computeTreasury(businessId),
    computeGoalProgress(businessId),
    prisma.customer.findMany({
      where: { businessId },
      select: { type: true, notes: true, _count: { select: { sales: true } } },
    }),
  ]);
  if (!dna) return null;

  const a = dna.activity;
  const topCats = a.categoryMix.map((c) => `${c.category} (${c.share} %)`).join(', ') || 'non catégorisé';
  const topProducts = a.topProducts.map((p) => p.name).join(', ') || 'à compléter';
  const prospects = customers.filter((c) => c.type === 'PROSPECT');
  const prospectNeeds = prospects.map((c) => c.notes).filter(Boolean).slice(0, 3);

  const marginTxt = a.grossMarginRate != null ? `${a.grossMarginRate} %` : 'à préciser (renseigner les coûts d’achat)';
  const monthlyRevenue = Math.round(a.revenue30);
  const monthlyExpenses = Math.round(treasury.totals.outflow / 6);

  const trend = treasury.months.slice(-3);
  const trendTxt = trend.length
    ? trend.map((m) => `${m.label} : encaissé ${n(m.inflow)}, net ${n(m.net)}`).join(' · ')
    : 'historique insuffisant';

  const previsionnelNet = Math.round((a.grossMarginRate != null ? monthlyRevenue * (a.grossMarginRate / 100) : monthlyRevenue * 0.25) - monthlyExpenses);

  const actions: string[] = [];
  for (const need of dna.needs) actions.push(need);
  for (const g of goals) actions.push(`Objectif « ${g.label || g.metricLabel} » : ${g.current}${g.unit} sur ${g.target}${g.unit} visés (${g.pct} %).`);
  if (actions.length === 0) actions.push('Maintenir le rythme de ventes et suivre la marge chaque mois.');

  return {
    resume:
      `${dna.identity.name} — ${dna.identity.sector}${dna.identity.city ? `, ${dna.identity.city}` : ''}. ` +
      `Activité portée par ${dna.identity.owner} depuis ${dna.identity.ageMonths} mois. ` +
      `Sur les 90 derniers jours : ${a.salesCount90} ventes pour ${n(a.revenue90)} de chiffre d’affaires, ` +
      `panier moyen ${n(a.avgBasket)}, marge brute ${marginTxt}. ` +
      `Santé de l’activité : ${dna.health.band} (score ${dna.health.score}/100).`,
    clienteleCible:
      `${dna.customers.total} client(s) enregistré(s), dont ${dna.customers.recurring} récurrent(s)` +
      `${dna.customers.topCustomer ? `, le principal étant ${dna.customers.topCustomer}` : ''}. ` +
      (prospectNeeds.length
        ? `Prospects en cours et besoins exprimés : ${prospectNeeds.join(' ; ')}.`
        : 'Développer un fichier prospects qualifié à partir des demandes reçues.'),
    offre:
      `Catalogue de ${a.productCount} produit(s)/service(s). Répartition du chiffre d’affaires : ${topCats}. ` +
      `Produits phares : ${topProducts}.`,
    differenciation:
      'À formuler : ce que vos clients réguliers valorisent (qualité, proximité, délai, prix, conseil). ' +
      'S’appuyer sur les avis des clients fidèles pour l’affiner.',
    canaux:
      'Vente directe enregistrée dans KESSIA Business (comptoir, commandes). ' +
      'Devis et factures pour les clients professionnels. ' +
      'Piste : relances CRM programmées et bouche-à-oreille des clients fidèles.',
    structureCouts:
      `Charges moyennes ~${n(monthlyExpenses)} / mois sur 6 mois. ` +
      `${dna.suppliers.count} fournisseur(s) suivi(s), ${n(dna.suppliers.spend90)} d’achats sur 90 jours. ` +
      `Marge brute ${marginTxt} : ${a.grossMarginRate != null && a.grossMarginRate < 25 ? 'à surveiller de près.' : 'correcte, à maintenir.'}`,
    previsionnel:
      `Chiffre d’affaires du dernier mois : ${n(monthlyRevenue)}. Tendance récente — ${trendTxt}. ` +
      `À charges et marge constantes, résultat mensuel estimé autour de ${n(previsionnelNet)} ` +
      `(projection indicative, pas une garantie). Utiliser le simulateur d’activité pour tester des hypothèses de croissance.`,
    risques:
      [
        dna.customers.recurring < 3 ? 'Dépendance à quelques clients : peu de clients récurrents.' : null,
        a.grossMarginRate != null && a.grossMarginRate < 20 ? 'Marge brute faible : sensibilité forte aux hausses de coûts.' : null,
        treasury.receivables.overdue > 0 ? `${n(treasury.receivables.overdue)} de factures échues non réglées.` : null,
        a.salesCount30 < 4 ? 'Ventes peu enregistrées : pilotage incomplet.' : null,
      ].filter(Boolean).join(' ') || 'Pas de risque majeur détecté sur les données actuelles ; rester vigilant sur la trésorerie.',
    prochainesActions: actions.slice(0, 6),
  };
}

