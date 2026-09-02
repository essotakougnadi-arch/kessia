// ============================================================
// KESSIA — useAiChat Hook
// Conversation avec KESSIA AI (mode règles côté serveur)
// ============================================================

'use client';

import { useCallback, useState } from 'react';
import { apiSend } from '@/lib/api/client';

export type AiChatMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  suggestions?: string[];
  createdAt: string;
};

export type AiContext =
  | 'ONBOARDING' | 'KYC' | 'WALLET' | 'TONTINE' | 'BUSINESS' | 'SUPPORT' | 'GENERAL';

const WELCOME: AiChatMessage = {
  id: 'welcome',
  role: 'ASSISTANT',
  content:
    'Bonjour ! 👋 Je suis KESSIA AI, votre assistant financier personnel. Posez-moi vos questions sur votre wallet, vos tontines, votre business ou la vérification KYC.',
  suggestions: ['Voir mon solde wallet', 'Créer une tontine', 'Comprendre le KYC'],
  createdAt: new Date().toISOString(),
};

type ChatResponse = {
  conversationId: string;
  message: {
    id: string;
    role: 'ASSISTANT';
    content: string;
    suggestions: string[];
    timestamp: string;
  };
};

export function useAiChat(context: AiContext = 'GENERAL') {
  const [messages, setMessages] = useState<AiChatMessage[]>([WELCOME]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;

      setError(null);
      setSending(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}`,
          role: 'USER',
          content,
          createdAt: new Date().toISOString(),
        },
      ]);

      const res = await apiSend<ChatResponse>('/api/v1/ai/chat', 'POST', {
        message: content,
        context,
        conversationId,
      });

      setSending(false);

      if (!res.success || !res.data) {
        setError(res.error ?? res.message ?? 'KESSIA AI est indisponible pour le moment.');
        return;
      }

      setConversationId(res.data.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: res.data!.message.id,
          role: 'ASSISTANT',
          content: res.data!.message.content,
          suggestions: res.data!.message.suggestions,
          createdAt: res.data!.message.timestamp,
        },
      ]);
    },
    [context, conversationId, sending]
  );

  const reset = useCallback(() => {
    setMessages([{ ...WELCOME, createdAt: new Date().toISOString() }]);
    setConversationId(undefined);
    setError(null);
  }, []);

  return { messages, sending, error, send, reset };
}
