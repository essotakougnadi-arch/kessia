'use client';
// ============================================================
// KESSIA Communauté — aperçu de démonstration (§11)
// Rejoindre / aimer sont simulés côté client, sans persistance.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { COMMUNITY_GROUPS, COMMUNITY_FEED } from '@/lib/modules/community-data';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from '@/components/modules/module-page.module.css';

export default function CommunityClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(new Set());

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
    </div>
  );
}
