'use client';
// ============================================================
// KESSIA Prêts coopératifs — aperçu de démonstration
// (ADR 0041, item 7 ; module REGULATED, cf. lib/modules/catalog.ts)
// Aucun octroi de crédit réel : les demandes ci-dessous sont des
// exemples pédagogiques. Accorder un crédit, même sans intérêt, est
// une activité potentiellement réglementée — même traitement que
// KESSIA Invest/Insurance.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { LOAN_CATEGORIES, LOAN_EXAMPLE_REQUESTS } from '@/lib/modules/loans-data';
import { formatCurrency } from '@/lib/utils/format';
import { useExplore } from '@/hooks/useExplore';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from '@/components/modules/module-page.module.css';

export default function LoansClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { interested, toggle } = useExplore();
  const on = interested.has('loans');

  const [category, setCategory] = useState<string | null>(null);
  const [supported, setSupported] = useState<Set<string>>(new Set());

  const shown = category ? LOAN_EXAMPLE_REQUESTS.filter((r) => r.category === category) : LOAN_EXAMPLE_REQUESTS;

  async function onToggle() {
    const r = await toggle('loans');
    addToast({
      type: r.success ? 'success' : 'error',
      message: r.success
        ? (r.on ? t('explore.notified', { name: 'Prêts coopératifs' }) : t('explore.removed', { name: 'Prêts coopératifs' }))
        : r.message,
    });
  }

  function support(id: string, title: string) {
    setSupported((prev) => new Set(prev).add(id));
    addToast({ type: 'success', message: t('modulesPages.loans.toastSupport', { title }) });
  }

  return (
    <div className={styles.page}>
      <Link href="/explore" className={styles.back}>← {t('common.back')}</Link>

      <div className={styles.hero} style={{ background: 'var(--gradient-green)' }}>
        <h1 className={styles.heroTitle}>{t('modulesPages.loans.heroTitle')}</h1>
        <p className={styles.heroText}>{t('modulesPages.loans.heroText')}</p>
      </div>

      <div className={styles.banner}>
        <strong>{t('modulesPages.previewLabel')}</strong> {t('modulesPages.loans.exampleBanner')}
      </div>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.loans.categoriesTitle')}</h2>
        <div className={styles.catGrid} style={{ marginTop: 10 }}>
          {LOAN_CATEGORIES.map((c) => (
            <div key={c.title} className={styles.catCard}>
              <span className={styles.catIcon} aria-hidden>{c.icon}</span>
              <span className={styles.catTitle}>{c.title}</span>
              <p className={styles.catDesc}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.loans.requestsTitle')}</h2>
        <div className={styles.chips} style={{ marginTop: 10 }}>
          <button className={`${styles.chip} ${!category ? styles.chipActive : ''}`} onClick={() => setCategory(null)}>
            {t('modulesPages.loans.allCategories')}
          </button>
          {LOAN_CATEGORIES.map((c) => (
            <button
              key={c.title}
              className={`${styles.chip} ${category === c.title ? styles.chipActive : ''}`}
              onClick={() => setCategory(c.title)}
            >
              {c.icon} {c.title}
            </button>
          ))}
        </div>

        <div className={styles.grid} style={{ marginTop: 12 }}>
          {shown.map((r) => {
            const isSupported = supported.has(r.id);
            return (
              <div key={r.id} className={styles.card} id={`loan-${r.id}`}>
                <div className={styles.cardTop}>
                  <span className={styles.cardIcon} style={{ background: 'rgba(31,93,74,0.12)' }}>{r.icon}</span>
                  <div>
                    <div className={styles.cardTitle}>{r.title}</div>
                    <div className={styles.cardMeta}>{r.category}</div>
                  </div>
                </div>
                <p className={styles.cardDesc}>{r.description}</p>

                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${r.fundedPercent}%` }} />
                </div>
                <div className={styles.tagRow}>
                  <span className={`${styles.tag} ${styles.tagGreen}`}>{t('modulesPages.loans.fundedLabel', { percent: r.fundedPercent })}</span>
                  <span className={styles.tag}>{t('modulesPages.loans.durationLabel', { n: r.durationMonths })}</span>
                </div>
                <p className={styles.cardDesc} style={{ fontSize: 11.5, fontStyle: 'italic' }}>{t('modulesPages.loans.noInterestNote')}</p>

                <div className={styles.cardFoot}>
                  <span className={styles.cardStat}>
                    {t('modulesPages.loans.goalLabel', { amount: formatCurrency(r.requestedAmount) })}
                  </span>
                  <button
                    className={`${styles.actionBtn} ${isSupported ? styles.actionBtnDone : ''}`}
                    disabled={isSupported}
                    onClick={() => support(r.id, r.title)}
                    id={`btn-support-loan-${r.id}`}
                  >
                    {isSupported ? t('modulesPages.loans.supported') : t('modulesPages.loans.support')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        className={`${styles.actionBtn} ${on ? styles.actionBtnDone : ''}`}
        style={{ alignSelf: 'flex-start' }}
        onClick={onToggle}
        id="btn-loans-interest"
      >
        {on ? t('explore.interestOn') : t('explore.interestOff')}
      </button>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.loans.bridgeTitle')}</h2>
        <div className={styles.bridgeRow} style={{ marginTop: 10 }}>
          <Link href="/tontine/garantie" className={styles.bridgeLink}>🛟 {t('modulesPages.loans.bridgeGuarantee')}</Link>
          <Link href="/tontine?type=growth" className={styles.bridgeLink}>🔄 {t('modulesPages.loans.bridgeTontine')}</Link>
        </div>
      </div>
    </div>
  );
}
