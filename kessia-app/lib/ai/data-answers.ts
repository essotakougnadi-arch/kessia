// ============================================================
// KESSIA AI — Réponses factuelles dérivées des données (§17)
//
// Avant la base de connaissances générique, l'assistant tente de
// répondre à une poignée de questions FACTUELLES avec les données
// réelles de l'utilisateur (solde, prochaine cotisation, score,
// ventes du mois, plan de croissance, opportunités).
//
// RÈGLE : ne renvoie une valeur financière que si elle vient du
// backend. Si l'intention n'est pas reconnue → null (fallback KB).
// ============================================================

import prisma from '@/lib/db/prisma';
import { computeKessiaScore } from '@/lib/score/score.service';
import { computeGrowthPlan } from '@/lib/growth/plan';
import { computeOpportunities } from '@/lib/opportunities/engine';

const DAY = 86_400_000;

export type DataAnswer = { content: string; suggestions: string[] };

function fcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}
function has(msg: string, ...words: string[]): boolean {
  return words.some((w) => msg.includes(w));
}

export async function answerFromData(rawMessage: string, userId: string): Promise<DataAnswer | null> {
  const m = rawMessage.toLowerCase();

  // ── Solde ─────────────────────────────────────────────────
  if (has(m, 'solde', 'combien') && has(m, 'wallet', 'compte', 'solde', "j'ai", 'ai-je', 'reste')) {
    const w = await prisma.wallet.findFirst({ where: { userId }, select: { balance: true } });
    if (w) {
      return {
        content: `Votre solde wallet est de ${fcfa(Number(w.balance))}. Vous pouvez le recharger via Mobile Money ou recevoir un transfert d'un autre membre KESSIA.`,
        suggestions: ['Recharger mon wallet', 'Voir mes transactions', 'Envoyer de l’argent'],
      };
    }
  }

  // ── Prochaine cotisation de tontine ───────────────────────
  if (has(m, 'cotisation', 'échéance', 'echeance', 'prochaine') && has(m, 'tontine', 'cotisation', 'échéance', 'echeance', 'payer', 'dois')) {
    const members = await prisma.tontineMember.findMany({
      where: { userId, status: 'ACTIVE', tontine: { status: 'ACTIVE' } },
      select: { tontine: { select: { name: true, amount: true, nextContributionDate: true, currentRound: true } } },
    });
    const upcoming = members
      .map((x) => x.tontine)
      .filter((t) => t.nextContributionDate)
      .sort((a, b) => new Date(a.nextContributionDate!).getTime() - new Date(b.nextContributionDate!).getTime());
    if (upcoming.length === 0) {
      return {
        content: "Vous n'avez aucune cotisation de tontine programmée pour le moment.",
        suggestions: ['Voir mes tontines', 'Rejoindre une tontine'],
      };
    }
    const t = upcoming[0];
    const days = Math.ceil((new Date(t.nextContributionDate!).getTime() - Date.now()) / DAY);
    const when = days < 0 ? `en retard de ${-days} j` : days === 0 ? "aujourd'hui" : `dans ${days} j`;
    return {
      content: `Votre prochaine cotisation : « ${t.name} », ${fcfa(Number(t.amount))} pour le tour ${t.currentRound}, ${when}.`,
      suggestions: ['Ouvrir cette tontine', 'Recharger mon wallet'],
    };
  }

  // ── KESSIA Score ──────────────────────────────────────────
  if (has(m, 'score', 'kessia score', 'fiabilité', 'fiabilite')) {
    const s = await computeKessiaScore(userId);
    const advice = s.advice[0] ? ` Pour progresser : ${s.advice[0]}` : '';
    return {
      content: `Votre KESSIA Score est de ${s.score}/1000 (${s.bandLabel}).${advice}`,
      suggestions: ['Voir le détail de mon score', 'Mon plan de croissance'],
    };
  }

  // ── Ventes du mois ────────────────────────────────────────
  if (has(m, 'vente', 'chiffre', "chiffre d'affaires", 'ca ', 'recette') && has(m, 'mois', 'aujourd', 'semaine', 'vente', 'ca')) {
    const from = new Date();
    from.setDate(1); from.setHours(0, 0, 0, 0);
    const businesses = await prisma.business.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { name: true, sales: { where: { status: 'COMPLETED', createdAt: { gte: from } }, select: { totalAmount: true } } },
    });
    if (businesses.length === 0) {
      return { content: "Vous n'avez pas encore d'activité Business enregistrée.", suggestions: ['Créer mon activité'] };
    }
    const lines = businesses.map((b) => {
      const total = b.sales.reduce((s, x) => s + Number(x.totalAmount), 0);
      return `${b.name} : ${b.sales.length} vente(s), ${fcfa(total)}`;
    });
    return {
      content: `Vos ventes depuis le début du mois — ${lines.join(' ; ')}.`,
      suggestions: ['Ouvrir mon activité', 'Voir l’ADN de mon entreprise'],
    };
  }

  // ── Plan de croissance ────────────────────────────────────
  if (has(m, 'plan de croissance', 'plan de croiss', 'que faire', 'quoi faire', 'améliorer', 'ameliorer', 'progresser', 'grandir')) {
    const plan = await computeGrowthPlan(userId);
    const next = plan.steps.find((st) => st.status === 'DOING') ?? plan.steps.find((st) => st.status === 'TODO');
    if (!next) {
      return { content: 'Votre plan de croissance est à jour — rien de prioritaire pour l’instant.', suggestions: ['Voir mon plan de croissance'] };
    }
    return {
      content: `Votre plan de croissance compte ${plan.summary.active} étape(s) active(s) (${plan.summary.completionPct} % complété). Priorité : ${next.title} — ${next.why}`,
      suggestions: ['Ouvrir mon plan de croissance', next.actionLabel],
    };
  }

  // ── Opportunités ──────────────────────────────────────────
  if (has(m, 'opportunit', 'gagner plus', 'développer', 'developper', 'idée', 'idee', 'conseil')) {
    const ops = await computeOpportunities(userId);
    if (ops.length === 0) {
      return { content: 'Aucune opportunité particulière détectée sur vos données pour l’instant.', suggestions: ['Voir mon plan de croissance'] };
    }
    const top = ops[0];
    return {
      content: `Opportunité repérée : ${top.title}. ${top.rationale}`,
      suggestions: ['Voir toutes les opportunités', top.actionLabel],
    };
  }

  return null;
}
