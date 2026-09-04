'use client';
// ============================================================
// KESSIA Communauté — aperçu de démonstration (§11)
// Rejoindre / aimer / envoyer un message sont simulés côté client,
// sans persistance ni interlocuteur réel. L'appel vidéo n'est qu'un
// bouton d'aperçu (aucune connexion temps réel).
// ============================================================

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  COMMUNITY_GROUPS,
  COMMUNITY_FEED,
  COMMUNITY_CONVERSATIONS,
  COMMUNITY_MESSAGES,
  AUTO_REPLIES,
  type ChatMessage,
} from '@/lib/modules/community-data';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from '@/components/modules/module-page.module.css';

type Tab = 'groups' | 'feed' | 'messages';

function nowLabel() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function CommunityClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const [tab, setTab] = useState<Tab>('groups');
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(new Set());

  const [messages, setMessages] = useState<ChatMessage[]>(COMMUNITY_MESSAGES);
  const [readConvos, setReadConvos] = useState<Set<string>>(new Set());
  const [activeConvo, setActiveConvo] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (replyTimer.current) clearTimeout(replyTimer.current); }, []);

  function toggleJoin(id: string, name: string) {
    setJoined((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        addToast({ type: 'info', message: t('modulesPages.community.toastLeft', { name }) });
      } else {
        next.add(id);
        addToast({ type: 'success', message: t('modulesPages.community.toastJoined', { name }) });
      }
      return next;
    });
  }

  function toggleLike(id: string) {
    setLiked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openConversation(id: string) {
    setActiveConvo(id);
    setReadConvos((prev) => new Set(prev).add(id));
  }

  function sendMessage() {
    const text = draft.trim();
    if (!text || !activeConvo) return;
    const mine: ChatMessage = {
      id: `local-${Date.now()}`,
      conversationId: activeConvo,
      from: 'me',
      text,
      time: nowLabel(),
    };
    setMessages((prev) => [...prev, mine]);
    setDraft('');

    const convoId = activeConvo;
    replyTimer.current = setTimeout(() => {
      const reply = AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)];
      setMessages((prev) => [...prev, {
        id: `auto-${Date.now()}`,
        conversationId: convoId,
        from: 'them',
        text: reply,
        time: nowLabel(),
      }]);
    }, 1100);
  }

  function onVideoCall() {
    addToast({ type: 'info', message: t('modulesPages.community.videoCallPreview') });
  }

  const convo = activeConvo ? COMMUNITY_CONVERSATIONS.find((c) => c.id === activeConvo) : null;
  const thread = activeConvo ? messages.filter((m) => m.conversationId === activeConvo) : [];

  return (
    <div className={styles.page}>
      <Link href="/explore" className={styles.back}>← {t('common.back')}</Link>

      <header className={styles.header}>
        <span className={styles.headerIcon} style={{ background: 'rgba(214,168,79,0.18)', color: '#9a7326' }}>🤝</span>
        <div>
          <h1 className={styles.title}>{t('modulesPages.community.pageTitle')}</h1>
          <p className={styles.sub}>{t('modulesPages.community.pageSub')}</p>
        </div>
      </header>

      <div className={styles.banner}>
        <strong>{t('modulesPages.previewLabel')}</strong> {t('modulesPages.community.banner')}
      </div>

      <div className={styles.chips}>
        <button className={`${styles.chip} ${tab === 'groups' ? styles.chipActive : ''}`} onClick={() => setTab('groups')} id="tab-groups">
          {t('modulesPages.community.tabGroups')}
        </button>
        <button className={`${styles.chip} ${tab === 'feed' ? styles.chipActive : ''}`} onClick={() => setTab('feed')} id="tab-feed">
          {t('modulesPages.community.tabFeed')}
        </button>
        <button className={`${styles.chip} ${tab === 'messages' ? styles.chipActive : ''}`} onClick={() => { setTab('messages'); setActiveConvo(null); }} id="tab-messages">
          {t('modulesPages.community.tabMessages')}
        </button>
      </div>

      {tab === 'groups' && (
        <div className={styles.grid}>
          {COMMUNITY_GROUPS.map((g) => {
            const isJoined = joined.has(g.id);
            const memberCount = g.members + (isJoined ? 1 : 0);
            return (
              <div key={g.id} className={styles.card} id={`group-${g.id}`}>
                <div className={styles.cardTop}>
                  <span className={styles.cardIcon} style={{ background: 'rgba(214,168,79,0.14)' }}>{g.icon}</span>
                  <div>
                    <div className={styles.cardTitle}>{g.name}</div>
                    <div className={styles.cardMeta}>{g.sector} · {g.city}</div>
                  </div>
                </div>
                <p className={styles.cardDesc}>{g.description}</p>
                <div className={styles.cardFoot}>
                  <span className={styles.cardStat}>{t('modulesPages.community.membersN', { n: memberCount })}</span>
                  <button
                    className={`${styles.actionBtn} ${isJoined ? styles.actionBtnDone : ''}`}
                    onClick={() => toggleJoin(g.id, g.name)}
                    id={`btn-join-${g.id}`}
                  >
                    {isJoined ? t('modulesPages.community.joined') : t('modulesPages.community.join')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'feed' && (
        <div>
          <h2 className={styles.sectionTitle}>{t('modulesPages.community.feedTitle')}</h2>
          <div className={styles.card} style={{ marginTop: 10 }}>
            {COMMUNITY_FEED.map((p) => {
              const isLiked = liked.has(p.id);
              return (
                <div key={p.id} className={styles.feedItem}>
                  <span className={styles.avatar}>{p.author.slice(0, 2).toUpperCase()}</span>
                  <div className={styles.feedBody}>
                    <div className={styles.feedHead}>
                      <span className={styles.feedAuthor}>{p.author}</span>
                      <span className={styles.feedGroup}>· {p.group}</span>
                      <span className={styles.feedTime}>{p.time}</span>
                    </div>
                    <p className={styles.feedText}>{p.text}</p>
                    <button className={`${styles.likeBtn} ${isLiked ? styles.likeBtnOn : ''}`} onClick={() => toggleLike(p.id)}>
                      {isLiked ? '❤️' : '🤍'} {p.likes + (isLiked ? 1 : 0)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'messages' && !convo && (
        <div>
          <h2 className={styles.sectionTitle}>{t('modulesPages.community.messagesTitle')}</h2>
          <p className={styles.sectionSub}>{t('modulesPages.community.messagesSub')}</p>
          <div className={styles.convoList}>
            {COMMUNITY_CONVERSATIONS.map((c) => {
              const isRead = readConvos.has(c.id);
              const unread = isRead ? 0 : c.unread;
              const last = [...messages].reverse().find((m) => m.conversationId === c.id);
              return (
                <button key={c.id} className={styles.convoItem} onClick={() => openConversation(c.id)} id={`convo-${c.id}`}>
                  <span className={styles.avatar}>{c.withInitials}</span>
                  <div className={styles.convoBody}>
                    <div className={styles.convoTop}>
                      <span className={styles.convoName}>{c.withName}</span>
                      <span className={styles.convoGroup}>· {c.group}</span>
                    </div>
                    {last && <p className={styles.convoLast}>{last.from === 'me' ? `${t('modulesPages.community.you')} ` : ''}{last.text}</p>}
                  </div>
                  {unread > 0 && <span className={styles.convoUnread}>{unread}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'messages' && convo && (
        <div>
          <div className={styles.threadHeader}>
            <button className={styles.threadBack} onClick={() => setActiveConvo(null)} id="btn-thread-back" aria-label={t('common.back')}>←</button>
            <span className={styles.avatar}>{convo.withInitials}</span>
            <div>
              <div className={styles.threadName}>{convo.withName}</div>
              <div className={styles.threadGroup}>{convo.group}</div>
            </div>
            <button className={styles.videoCallBtn} onClick={onVideoCall} id="btn-video-call">
              🎥 {t('modulesPages.community.videoCall')}
            </button>
          </div>

          <div className={styles.msgList} id="msg-list">
            {thread.map((m) => (
              <div key={m.id} className={`${styles.msgBubble} ${m.from === 'me' ? styles.msgMine : styles.msgTheirs}`}>
                {m.text}
                <span className={styles.msgTime}>{m.time}</span>
              </div>
            ))}
          </div>

          <div className={styles.msgInputRow}>
            <input
              className={styles.msgInput}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
              placeholder={t('modulesPages.community.messagePlaceholder')}
              id="msg-input"
            />
            <button className={styles.msgSendBtn} onClick={sendMessage} disabled={!draft.trim()} id="btn-send-message" aria-label={t('modulesPages.community.send')}>
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
