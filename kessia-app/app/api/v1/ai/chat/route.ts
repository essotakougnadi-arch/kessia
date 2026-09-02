// ============================================================
// KESSIA — POST /api/v1/ai/chat
// KESSIA AI — Assistant financier intelligent
// Fonctionne en mode règles (sans clé API externe)
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { answerFromData } from '@/lib/ai/data-answers';

const chatSchema = z.object({
  message: z.string().min(1, 'Message vide').max(1000, 'Message trop long'),
  context: z.enum(['ONBOARDING', 'KYC', 'WALLET', 'TONTINE', 'BUSINESS', 'SUPPORT', 'GENERAL']).default('GENERAL'),
  conversationId: z.string().optional(),
});

// Base de connaissances KESSIA AI (mode règles)
const KESSIA_AI_KB: Record<string, { keywords: string[]; response: string; suggestions?: string[] }> = {
  wallet_balance: {
    keywords: ['solde', 'argent', 'balance', 'wallet', 'combien'],
    response: 'Votre solde est disponible dans l\'onglet Wallet de votre tableau de bord. Vous pouvez également effectuer des dépôts via Mobile Money ou recevoir des transferts d\'autres utilisateurs KESSIA.',
    suggestions: ['Voir mon solde', 'Faire un dépôt', 'Envoyer de l\'argent'],
  },
  tontine_create: {
    keywords: ['créer', 'tontine', 'groupe', 'cotisation', 'nouveau'],
    response: 'Pour créer une tontine KESSIA : 1️⃣ Allez dans "Tontines" 2️⃣ Cliquez "Nouvelle Tontine" 3️⃣ Choisissez le type (Rotative, Projet, Croissance) 4️⃣ Définissez le montant et la fréquence 5️⃣ Partagez le code d\'invitation avec vos membres.',
    suggestions: ['Créer une tontine', 'Rejoindre une tontine', 'Comment fonctionne la tontine ?'],
  },
  tontine_join: {
    keywords: ['rejoindre', 'intégrer', 'code', 'invitation'],
    response: 'Pour rejoindre une tontine, demandez le code d\'invitation (format KESS-XXXXXX) à l\'organisateur, puis allez dans "Tontines" → "Rejoindre" → entrez le code.',
    suggestions: ['J\'ai un code d\'invitation', 'Voir mes tontines'],
  },
  kyc_info: {
    keywords: ['kyc', 'vérification', 'identité', 'documents', 'carte', 'passeport'],
    response: 'La vérification KYC (Know Your Customer) vous permet de débloquer des fonctionnalités avancées :\n• Niveau 1 : Carte d\'identité ou Passeport + Selfie → Limite 500 000 XOF/mois\n• Niveau 2 : Justificatif de domicile → Limite augmentée\n\nVos documents sont sécurisés et chiffrés.',
    suggestions: ['Commencer la vérification KYC', 'Quels documents faut-il ?'],
  },
  business_create: {
    keywords: ['business', 'entreprise', 'boutique', 'commerce', 'vente', 'créer entreprise'],
    response: 'Avec KESSIA Business, gérez votre entreprise facilement :\n✅ Catalogue produits\n✅ Enregistrement des ventes\n✅ Suivi des dépenses\n✅ Rapports et KPIs\n✅ Gestion des stocks\n\nCréez votre business en quelques minutes !',
    suggestions: ['Créer mon business', 'Voir mes ventes', 'Ajouter un produit'],
  },
  transfer: {
    keywords: ['envoyer', 'transfert', 'virement', 'payer', 'numéro'],
    response: 'Pour envoyer de l\'argent à un autre utilisateur KESSIA : allez dans Wallet → Envoyer → saisissez le numéro de téléphone du destinataire et le montant. Les transferts sont instantanés et sans frais entre membres KESSIA.',
    suggestions: ['Faire un transfert', 'Voir l\'historique'],
  },
  deposit: {
    keywords: ['déposer', 'recharger', 'alimenter', 'moov', 'tmoney', 'flooz'],
    response: 'Pour déposer de l\'argent sur votre wallet KESSIA, utilisez votre Mobile Money (TMoney, Flooz/Moov Money) ou effectuez un virement bancaire. Le dépôt est instantané via Mobile Money.',
    suggestions: ['Déposer via Mobile Money', 'Voir mon solde'],
  },
  support: {
    keywords: ['aide', 'problème', 'support', 'contact', 'bug', 'erreur'],
    response: 'Notre équipe support est disponible pour vous aider ! Vous pouvez :\n📩 Ouvrir un ticket dans l\'onglet Support\n📞 Nous appeler au +228 XX XX XX XX\n🕐 Disponible Lun-Sam 8h-18h\n\nRéponse sous 24h ouvrées.',
    suggestions: ['Ouvrir un ticket', 'Consulter la FAQ'],
  },
  fees: {
    keywords: ['frais', 'commission', 'tarif', 'prix', 'gratuit', 'combien ça coûte', 'plafond', 'plafonds', 'limite'],
    response: 'KESSIA est transparent sur ses tarifs :\n✅ Inscription, wallet, transferts entre membres, tontines, Business, IA : gratuits\n💡 Retrait vers Mobile Money : 0,5 % (affiché avant chaque retrait)\n\nVos plafonds dépendent de votre niveau KYC. Tout est détaillé dans « Transparence & tarifs » (menu Profil).',
    suggestions: ['Ouvrir Transparence & tarifs', 'Augmenter mes plafonds'],
  },
  calendar: {
    keywords: ['agenda', 'calendrier', 'échéance', 'echeance', 'quand payer', 'prochaine facture', 'mes rendez-vous'],
    response: 'Votre Agenda (menu Accueil → Agenda) réunit toutes vos échéances : cotisations de tontine, factures à encaisser, étapes de votre plan de croissance et relances clients, avec les retards signalés en rouge.',
    suggestions: ['Ouvrir mon agenda'],
  },
  security_help: {
    keywords: ['sécurité', 'securite', 'piraté', 'pirate', 'compte compromis', 'activité inhabituelle', 'fraude', 'vol'],
    response: 'Si vous constatez une activité inhabituelle : changez immédiatement votre mot de passe (Profil → Sécurité, ce qui déconnecte toutes les sessions), activez la double authentification, et contactez le support. KESSIA surveille aussi automatiquement les opérations à risque et vous alerte.',
    suggestions: ['Ouvrir la sécurité du compte', 'Contacter le support'],
  },
  growth_plan: {
    keywords: ['plan de croissance', 'croissance', 'progresser', 'grandir', 'objectif personnel', 'feuille de route'],
    response: 'Votre Plan de croissance (onglet « Croissance ») transforme vos points faibles en étapes concrètes : chaque étape a un objectif, une action, une échéance et un indicateur de suivi. Il est recalculé à partir de votre KESSIA Score, de l\'ADN de votre entreprise et de vos tontines.',
    suggestions: ['Ouvrir mon plan de croissance', 'Voir mon KESSIA Score'],
  },
  simulator: {
    keywords: ['simuler', 'simulateur', 'projection', 'combien épargner', 'combien economiser', 'combien vais-je'],
    response: 'Les simulateurs (menu « Simuler ») calculent des projections à partir de vos hypothèses :\n• Épargne : versement mensuel + durée → capital projeté et objectif\n• Tontine : montant + membres + fréquence → ce que vous versez et recevez, à quel tour\n• Activité : CA actuel + croissance visée → CA, marge et résultat projetés\n\nCe sont des projections, pas des promesses — KESSIA ne garantit aucun rendement.',
    suggestions: ['Ouvrir les simulateurs', 'Simuler un objectif d’épargne'],
  },
  opportunities: {
    keywords: ['opportunité', 'opportunite', 'idée business', 'idee business', 'comment gagner'],
    response: 'KESSIA repère des opportunités concrètes dans vos propres données : devis à relancer, clients à réactiver, réassorts rentables, tontines publiques adaptées, palier de Score à franchir. Retrouvez-les sur votre accueil et dans KESSIA AI.',
    suggestions: ['Voir mes opportunités', 'Mon plan de croissance'],
  },
  crm: {
    keywords: ['client', 'crm', 'relance', 'fidéliser', 'fideliser', 'prospect', 'fournisseur', 'devis'],
    response: 'Dans une activité Business, l\'onglet « Clients » segmente automatiquement vos contacts (prospect, nouveau, régulier, fidèle, inactif), garde leur historique et vos notes, et vous permet de programmer des relances datées. L\'onglet « Devis & Factures » convertit un devis accepté en facture en un clic.',
    suggestions: ['Ouvrir mon activité', 'Voir l’ADN de mon entreprise'],
  },
  business_dna: {
    keywords: ['adn', 'santé entreprise', 'sante entreprise', 'diagnostic', 'business plan', 'plan d\'affaires', 'plan d affaires'],
    response: 'L\'ADN de votre entreprise (onglet « ADN ») agrège vos ventes, votre marge, vos clients et vos objectifs en un profil unique, avec un score de santé et des recommandations. À partir de là, l\'onglet « Plan » génère un brouillon de plan d\'affaires que vous pouvez éditer.',
    suggestions: ['Ouvrir l’ADN', 'Générer mon plan d’affaires'],
  },
  explore: {
    keywords: ['explorer', 'autres modules', 'market', 'academy', 'nouveautés', 'nouveautes', 'à venir', 'a venir'],
    response: 'La page « Explorer » recense tout l\'écosystème KESSIA : les services disponibles (Wallet, Tontines, Business, IA, Score, Croissance, Simulateurs) et ceux de la feuille de route (Market, Academy, Communauté, Jobs, Diaspora…). Vous pouvez cliquer « M\'intéresser » pour être prévenu à leur ouverture.',
    suggestions: ['Ouvrir Explorer'],
  },
};

type AiSource = 'data' | 'kb' | 'fallback';

function generateAIResponse(message: string, context: string): {
  content: string;
  suggestions: string[];
  source: AiSource;
} {
  const lowerMsg = message.toLowerCase();

  // Chercher la meilleure réponse dans la base de connaissances
  let bestMatch: typeof KESSIA_AI_KB[string] | null = null;
  let maxMatches = 0;

  for (const [, entry] of Object.entries(KESSIA_AI_KB)) {
    const matches = entry.keywords.filter((kw) => lowerMsg.includes(kw)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      bestMatch = entry;
    }
  }

  if (bestMatch && maxMatches > 0) {
    return {
      content: bestMatch.response,
      suggestions: bestMatch.suggestions ?? [],
      source: 'kb',
    };
  }

  // Réponses contextuelles selon le module
  const contextResponses: Record<string, string> = {
    WALLET: 'Votre wallet KESSIA vous permet de stocker, envoyer et recevoir de l\'argent facilement. Que souhaitez-vous faire ?',
    TONTINE: 'Les tontines KESSIA modernisent l\'épargne collective africaine. Je peux vous aider à créer ou gérer vos tontines !',
    BUSINESS: 'KESSIA Business simplifie la gestion de votre commerce. Ventes, stocks, dépenses — tout en un !',
    KYC: 'La vérification KYC sécurise votre compte et augmente vos limites. C\'est simple et rapide !',
    GENERAL: 'Bonjour ! Je suis KESSIA AI, votre assistant financier personnel. Posez-moi vos questions sur le wallet, les tontines, votre business ou la vérification KYC.',
  };

  return {
    content: contextResponses[context] ?? contextResponses.GENERAL,
    suggestions: ['Gérer mon wallet', 'Mes tontines', 'Mon business', 'Aide & Support'],
    source: 'fallback',
  };
}

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'ai.chat', {
      limit: 30, windowMs: 60_000, by: context.userId,
    });
    if (limited) return limited;

    const body = await request.json();
    const parsed = chatSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { message, context: aiContext, conversationId } = parsed.data;

    // Récupérer ou créer la conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.aiConversation.findFirst({
        where: { id: conversationId, userId: context.userId },
      });
    }

    if (!conversation) {
      conversation = await prisma.aiConversation.create({
        data: { userId: context.userId, context: aiContext },
      });
    }

    // Sauvegarder le message utilisateur
    await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content: message,
      },
    });

    // Générer la réponse AI — d'abord une réponse factuelle sur les
    // données réelles de l'utilisateur, sinon la base de connaissances.
    let aiResponse: { content: string; suggestions: string[]; source: AiSource };
    try {
      const dataAnswer = await answerFromData(message, context.userId);
      aiResponse = dataAnswer
        ? { content: dataAnswer.content, suggestions: dataAnswer.suggestions, source: 'data' }
        : generateAIResponse(message, aiContext);
    } catch (e) {
      logApiError('/v1/ai/chat:data-answer', e);
      aiResponse = generateAIResponse(message, aiContext);
    }

    // Sauvegarder la réponse AI. `source` alimente les KPI back-office
    // (part des réponses issues des données / KB / repli générique — §54).
    const aiMessage = await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: aiResponse.content,
        metadata: { suggestions: aiResponse.suggestions, source: aiResponse.source },
      },
    });

    return ok({
      conversationId: conversation.id,
      message: {
        id: aiMessage.id,
        role: 'ASSISTANT',
        content: aiResponse.content,
        suggestions: aiResponse.suggestions,
        timestamp: aiMessage.createdAt,
      },
    });
  } catch (error) {
    logApiError('/v1/ai/chat', error);
    return serverError();
  }
}
