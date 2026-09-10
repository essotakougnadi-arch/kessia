// ============================================================
// KESSIA AI — branchement optionnel d'un vrai LLM (ADR 0046)
//
// Le mode par défaut de l'assistant reste « règles + données » :
//   • answerFromData()  — chiffres réels de l'utilisateur (exact, gratuit)
//   • base de connaissances — réponses cadrées sur les écrans KESSIA
//
// Ce module ajoute un 3ᵉ étage FACULTATIF : quand ni les données ni la
// base de connaissances ne répondent, on peut interroger Claude. Il ne
// s'active QUE si les deux conditions sont réunies (aucun coût sinon) :
//   • ANTHROPIC_API_KEY présent
//   • KESSIA_AI_LLM = "1"   (opt-in explicite — « valider le budget »)
//
// Modèle : KESSIA_AI_MODEL (déf. claude-opus-5). Pour un assistant de
// chat à volume, claude-haiku-4-5 ou claude-sonnet-5 sont nettement
// moins chers — voir docs/decisions/0046 et .env.example.
//
// Garde-fous : le LLM est fortement cadré (pas de promesse de rendement,
// jamais de chiffre inventé, s'appuie sur le contexte fourni, répond en
// français, renvoie vers les vrais écrans). Toute erreur/temporisation
// → on retombe silencieusement sur les règles.
// ============================================================

import { logApiError } from '@/lib/logger';

const MODEL = process.env.KESSIA_AI_MODEL || 'claude-opus-5';
const TIMEOUT_MS = 12_000;
const MAX_TOKENS = 700;

export function llmConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.KESSIA_AI_LLM === '1';
}

const SYSTEM_PROMPT = `Tu es KESSIA AI, l'assistant de l'application financière KESSIA (Togo).
KESSIA propose : wallet (dépôt Mobile Money, transferts gratuits entre membres, retrait 0,5 %),
tontines (rotative, projet, croissance, achat — avec séquestre par tontine), un score KESSIA,
un plan de croissance, des simulateurs, un module Business (ventes, dépenses, clients, devis/factures),
un marketplace communautaire avec livraison Miaride, et la vérification KYC (niveaux 0/1/2).

Règles STRICTES :
- Réponds en français, ton chaleureux et concret, 4 phrases maximum.
- N'invente JAMAIS de chiffre, de solde, de montant ou de date : n'utilise que ce qui est
  dans le CONTEXTE fourni. Si le contexte est vide, réponds de façon générale et invite
  l'utilisateur à ouvrir l'écran concerné.
- Ne promets aucun rendement, aucun gain, aucune performance. KESSIA ne garantit rien.
- Ne donne pas de conseil en investissement individualisé ni de conseil juridique/fiscal.
- Oriente vers les vrais écrans (Wallet, Tontines, Croissance, Simuler, Business, Explorer,
  Profil → Sécurité / Transparence & tarifs, Support).
- Pas de markdown lourd : phrases simples, éventuellement une courte énumération.`;

export type LlmResult = { content: string; suggestions: string[] };

/**
 * Interroge Claude. `grounding` = réponse factuelle déjà calculée sur les
 * données de l'utilisateur (ou réponse de la base de connaissances), passée
 * comme contexte pour ancrer la réponse. Renvoie `null` en cas d'échec.
 */
export async function llmAnswer(input: {
  message: string;
  aiContext: string;
  grounding?: string | null;
}): Promise<LlmResult | null> {
  if (!llmConfigured()) return null;

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic();

    const contextBlock = input.grounding
      ? `CONTEXTE (données réelles de l'utilisateur ou réponse de référence) :\n${input.grounding}`
      : 'CONTEXTE : (aucune donnée spécifique disponible)';

    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        // Assistant de chat : réponse courte et rapide. Pour affiner le
        // coût/qualité (effort, thinking adaptatif), bumper le SDK puis
        // ajouter `output_config: { effort: 'low' }`.
        messages: [
          {
            role: 'user',
            content: `Module courant : ${input.aiContext}\n\n${contextBlock}\n\nQuestion : ${input.message}`,
          },
        ],
      },
      { timeout: TIMEOUT_MS },
    );

    const text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!text) return null;
    return { content: text, suggestions: [] };
  } catch (e) {
    logApiError('/lib/ai/llm', e);
    return null;
  }
}
