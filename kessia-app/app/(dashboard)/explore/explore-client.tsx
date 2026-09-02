'use client';
// ============================================================
// KESSIA — Explorer : services disponibles + feuille de route (§5, §9–§16, §37)
// ============================================================

import Link from 'next/link';
import styles from './explore.module.css';
import type { ModuleEntry } from '@/lib/modules/catalog';
import { useModuleCatalog } from '@/lib/modules/i18n';
import { useExplore } from '@/hooks/useExplore';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';

export default function ExploreClient() {
  const t = useT();
  const { live, upcoming, statusLabel } = useModuleCatalog();
  const { interested, toggle } = useExplore();
  const addToast = useUiStore((s) => s.addToast);

  async function onToggle(m: ModuleEntry) {
    const r = await toggle(m.key);
    if (r.success) {
      addToast({
        type: 'success',
        message: r.on ? t('explore.notified', { name: m.name }) : t('explore.removed', { name: m.name }),
      });
    } else {
      addToast({ type: 'error', message: r.message });
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('explore.title')}</h1>
        <p className={styles.sub}>{t('explore.subtitle')}</p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('explore.available')}</h2>
        <div className={styles.grid}>
          {live.map((m) => (
            <Link key={m.key} href={m.href!} className={`${styles.card} ${styles.cardLink}`}>
              <div className={styles.cardTop}>
                <span className={styles.icon} style={{ background: `${m.accent}1F`, color: m.accent }}>{m.icon}</span>
                <div>
                  <div className={styles.name}>{m.name}</div>
                  <div className={styles.tagline}>{m.tagline}</div>
                </div>
                <span className={`${styles.status} ${styles.sLive}`}>{statusLabel('LIVE')}</span>
              </div>
              <p className={styles.desc}>{m.description}</p>
              <span className={styles.arrow}>{t('explore.open')}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('explore.roadmap')}</h2>
        <div className={styles.grid}>
          {upcoming.map((m) => {
            const on = interested.has(m.key);
            return (
              <div key={m.key} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.icon} style={{ background: `${m.accent}1F`, color: m.accent }}>{m.icon}</span>
                  <div>
                    <div className={styles.name}>{m.name}</div>
                    <div className={styles.tagline}>{m.tagline}</div>
                  </div>
                  <span className={`${styles.status} ${m.status === 'REGULATED' ? styles.sReg : styles.sSoon}`}>
                    {statusLabel(m.status)}
                  </span>
                </div>
                <p className={styles.desc}>{m.description}</p>
                <button
                  className={`${styles.interestBtn} ${on ? styles.interestOn : ''}`}
                  onClick={() => onToggle(m)}
                >
                  {on ? t('explore.interestOn') : t('explore.interestOff')}
                </button>
              </div>
            );
          })}
        </div>
        <p className={styles.note}>{t('explore.roadmapNote')}</p>
      </section>
    </div>
  );
}
