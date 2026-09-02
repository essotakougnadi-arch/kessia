'use client';
// ============================================================
// KESSIA — AI Chat (Client Component)
// ============================================================

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './ai.module.css';
import { useAiChat } from '@/hooks/useAiChat';
import { useInsights } from '@/hooks/useInsights';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useProfile } from '@/hooks/useProfile';
import { useVoice } from '@/hooks/useVoice';
import { useUiStore } from '@/store/uiStore';
import { useUserTypeMeta } from '@/lib/user/user-type-i18n';
import { matchVoiceCommand } from '@/lib/voice/commands';
import { useT } from '@/lib/i18n';

const DEFAULT_QUESTION_KEYS = ['ai.q1', 'ai.q2', 'ai.q3', 'ai.q4'];

const CAPABILITY_KEYS = [
  { icon: '💰', key: 'ai.cap1' },
  { icon: '🔄', key: 'ai.cap2' },
  { icon: '🏪', key: 'ai.cap3' },
  { icon: '📊', key: 'ai.cap4' },
  { icon: '🔐', key: 'ai.cap5' },
  { icon: '🎯', key: 'ai.cap6' },
];

function hhmm(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function AiClient() {
  const t = useT();
  const searchParams = useSearchParams();
  const { messages, sending, error, send, reset } = useAiChat('GENERAL');
  const { insights } = useInsights();
  const { opportunities } = useOpportunities();
  const { profile } = useProfile();
  const userTypeI18n = useUserTypeMeta();
  const suggestedQuestions = (() => {
    const prompts = profile ? userTypeI18n.get(profile.profile.userType).aiPrompts : [];
    return prompts.length > 0 ? prompts : DEFAULT_QUESTION_KEYS.map((k) => t(k));
  })();
  const router = useRouter();
  const addToast = useUiStore((s) => s.addToast);
  const [draft, setDraft] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voice = useVoice((text) => {
    // Commande vocale de navigation (§34) → on ouvre l'écran ; sinon on dicte.
    const cmd = matchVoiceCommand(text);
    if (cmd) {
      addToast({ type: 'success', message: t('ai.opening', { name: cmd.label }) });
      if (cmd.href === 'back') router.back();
      else router.push(cmd.href);
      return;
    }
    setDraft((d) => (d ? `${d} ${text}` : text));
  });
  const spokenRef = useRef<string | null>(null);

  // Pré-remplir depuis ?q= (lien FAQ)
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setDraft(q);
  }, [searchParams]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  // Lecture vocale de la dernière réponse (si activée)
  useEffect(() => {
    if (!autoSpeak || sending) return;
    const last = messages[messages.length - 1];
    if (last && last.role === 'ASSISTANT' && last.id !== spokenRef.current) {
      spokenRef.current = last.id;
      voice.speak(last.content);
    }
  }, [messages, sending, autoSpeak, voice]);

  function submit() {
    if (!draft.trim() || sending) return;
    send(draft);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.aiAvatar}><span>✨</span></div>
          <div>
            <div className={styles.aiName}>KESSIA AI</div>
            <div className={styles.aiStatus}>
              <span className={styles.aiDot} />
              {t('ai.online')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {voice.ttsSupported && (
            <button
              className={styles.clearBtn}
              id="btn-toggle-speak"
              aria-pressed={autoSpeak}
              onClick={() => { setAutoSpeak((v) => !v); if (autoSpeak) voice.stopSpeaking(); }}
            >
              {autoSpeak ? t('ai.voiceOn') : t('ai.voiceOff')}
            </button>
          )}
          <button className={styles.clearBtn} id="btn-clear-chat" onClick={reset}>
            {t('ai.clear')}
          </button>
        </div>
      </div>

      <div className={styles.chatArea} ref={scrollRef}>
        <div className={styles.capBanner}>
          <div className={styles.capTitle}>{t('ai.capTitle')}</div>
          <div className={styles.capGrid}>
            {CAPABILITY_KEYS.map((c) => (
              <div key={c.key} className={styles.capItem}>
                <span>{c.icon}</span>
                <span>{t(c.key)}</span>
              </div>
            ))}
          </div>
        </div>

        {messages.length === 0 && opportunities.length > 0 && (
          <div className={styles.capBanner}>
            <div className={styles.capTitle}>{t('ai.opportunitiesTitle')}</div>
            {opportunities.slice(0, 4).map((op) => (
              <Link
                key={op.id}
                href={op.actionUrl}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid var(--color-border)', textDecoration: 'none', color: 'inherit' }}
              >
                <span style={{ fontSize: 18 }}>{op.icon}</span>
                <span style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: 13 }}>{op.title}</strong>
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{op.rationale}</span>
                </span>
                <span style={{ color: 'var(--color-primary)' }}>→</span>
              </Link>
            ))}
          </div>
        )}

        {messages.length === 0 && insights.length > 0 && (
          <div className={styles.capBanner}>
            <div className={styles.capTitle}>{t('ai.insightsTitle')}</div>
            {insights.slice(0, 4).map((it) => {
              const row = (
                <>
                  <span style={{ fontSize: 18 }}>{it.icon}</span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: 13 }}>{it.title}</strong>
                    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{it.body}</span>
                  </span>
                  {it.actionUrl && <span style={{ color: 'var(--color-primary)' }}>→</span>}
                </>
              );
              return it.actionUrl ? (
                <Link
                  key={it.id}
                  href={it.actionUrl}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid var(--color-border)', textDecoration: 'none', color: 'inherit' }}
                >
                  {row}
                </Link>
              ) : (
                <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid var(--color-border)' }}>
                  {row}
                </div>
              );
            })}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`${styles.message} ${styles[`message_${msg.role.toLowerCase()}`]}`}>
            {msg.role === 'ASSISTANT' && <div className={styles.msgAvatar}>✨</div>}
            <div className={styles.msgBubbleWrapper}>
              <div className={styles.msgBubble}>
                <div className={styles.msgContent}>{msg.content}</div>
                <div className={styles.msgTime}>{hhmm(msg.createdAt)}</div>
              </div>
              {msg.role === 'ASSISTANT' && msg.suggestions && msg.suggestions.length > 0 && (
                <div className={styles.suggestions}>
                  {msg.suggestions.map((s) => (
                    <button
                      key={s}
                      className={styles.suggestionBtn}
                      onClick={() => send(s)}
                      disabled={sending}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className={styles.typingIndicator}>
            <div className={styles.msgAvatar}>✨</div>
            <div className={styles.typingDots}><span /><span /><span /></div>
          </div>
        )}

        {error && (
          <div className={`${styles.message} ${styles.message_assistant}`}>
            <div className={styles.msgAvatar}>⚠️</div>
            <div className={styles.msgBubbleWrapper}>
              <div className={styles.msgBubble}>
                <div className={styles.msgContent}>{error}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.suggestionsBar}>
        <div className={styles.suggestionsLabel}>{t('ai.suggestions')}</div>
        <div className={styles.suggestionsScroll}>
          {suggestedQuestions.map((q) => (
            <button
              key={q}
              className={styles.suggestChip}
              onClick={() => send(q)}
              disabled={sending}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          {voice.sttSupported && (
            <button
              type="button"
              className={styles.sendBtn}
              id="btn-mic-ai"
              aria-pressed={voice.listening}
              title={voice.listening ? t('ai.micStop') : t('ai.micStart')}
              style={voice.listening ? { background: 'var(--color-danger)' } : { background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
              onClick={() => (voice.listening ? voice.stopListening() : voice.startListening())}
            >
              <span>{voice.listening ? '■' : '🎤'}</span>
            </button>
          )}
          <textarea
            id="ai-input"
            className={styles.input}
            placeholder={voice.listening ? t('ai.speaking') : t('ai.inputPlaceholder')}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button className={styles.sendBtn} id="btn-send-ai" onClick={submit} disabled={sending || !draft.trim()}>
            <span>↑</span>
          </button>
        </div>
        <div className={styles.inputFooter}>{t('ai.footer')}</div>
      </div>
    </div>
  );
}
