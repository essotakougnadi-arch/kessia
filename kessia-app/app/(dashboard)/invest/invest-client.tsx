'use client';
// ============================================================
// KESSIA Invest — aperçu de démonstration (§13, module REGULATED)
// Les projets ci-dessous sont des EXEMPLES PÉDAGOGIQUES (montants et
// pourcentages illustratifs) : ouverture réelle soumise à validation
// réglementaire. Voir lib/modules/catalog.ts + invest-insurance-data.ts.
//
// Second onglet « Financement participatif » (ADR 0041, item 6) : un
// cadre volontairement DIFFÉRENT (don/soutien communautaire, jamais de
// rendement) présenté ici plutôt que dans un module à part, pour éviter
// un doublon avec KESSIA Invest.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import {
  INVEST_CATEGORIES,
  INVEST_EXAMPLE_PROJECTS,
  CROWDFUNDING_CATEGORIES,
  CROWDFUNDING_CAMPAIGNS,
} from '@/lib/modules/invest-insurance-data';
import { formatCurrency } from '@/lib/utils/format';
import { useExplore } from '@/hooks/useExplore';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from '@/components/modules/module-page.module.css';

type Mode = 'invest' | 'crowdfunding';

export default function InvestClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { interested, toggle } = useExplore();
  const on = interested.has('invest');

  const [mode, setMode] = useState<Mode>('invest');
  const [category, setCategory] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [supported, setSupported] = useState<Set<string>>(new Set());

  const shownProjects = category ? INVEST_EXAMPLE_PROJECTS.filter((p) => p.category === category) : INVEST_EXAMPLE_PROJECTS;
  const shownCampaigns = category ? CROWDFUNDING_CAMPAIGNS.filter((c) => c.category === category) : CROWDFUNDING_CAMPAIGNS;
  const categories = mode === 'invest' ? INVEST_CATEGORIES : CROWDFUNDING_CATEGORIES;

  function switchMode(m: Mode) {
    setMode(m);
    setCategory(null);
  }

  async function onToggle() {
    const r = await toggle('invest');
    addToast({
      type: r.success ? 'success' : 'error',
      message: r.success
        ? (r.on ? t('explore.notified', { name: 'KESSIA Invest' }) : t('explore.removed', { name: 'KESSIA Invest' }))
        : r.message,
    });
  }

  function flagProject(id: string, title: string) {
    setFlagged((prev) => new Set(prev).add(id));
    addToast({ type: 'success', message: t('modulesPages.invest.toastProjectInterest', { title }) });
  }

  function supportCampaign(id: string, title: string) {
    setSupported((prev) => new Set(prev).add(id));
    addToast({ type: 'success', message: t('modulesPages.invest.toastSupport', { title }) });
  }

  return (
    <div className={styles.page}>
      <Link href="/explore" className={styles.back}>← {t('common.back')}</Link>

      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>{t('modulesPages.invest.heroTitle')}</h1>
        <p className={styles.heroText}>{t('modulesPages.invest.heroText')}</p>
      </div>

      <div className={styles.chips}>
        <button className={`${styles.chip} ${mode === 'invest' ? styles.chipActive : ''}`} onClick={() => switchMode('invest')} id="mode-invest">
          {t('modulesPages.invest.modeInvest')}
        </button>
        <button className={`${styles.chip} ${mode === 'crowdfunding' ? styles.chipActive : ''}`} onClick={() => switchMode('crowdfunding')} id="mode-crowdfunding">
          {t('modulesPages.invest.modeCrowdfunding')}
        </button>
      </div>

      <div className={styles.banner}>
        <strong>{t('modulesPages.previewLabel')}</strong> {mode === 'invest' ? t('modulesPages.invest.exampleBanner') : t('modulesPages.invest.crowdfundingBanner')}
      </div>

      <div>
        <h2 className={styles.sectionTitle}>{mode === 'invest' ? t('modulesPages.invest.projectsTitle') : t('modulesPages.invest.campaignsTitle')}</h2>
        <div className={styles.chips} style={{ marginTop: 10 }}>
          <button className={`${styles.chip} ${!category ? styles.chipActive : ''}`} onClick={() => setCategory(null)}>
            {t('modulesPages.invest.allCategories')}
          </button>
          {categories.map((c) => (
            <button
              key={c.title}
              className={`${styles.chip} ${category === c.title ? styles.chipActive : ''}`}
              onClick={() => setCategory(c.title)}
            >
              {c.icon} {c.title}
            </button>
          ))}
        </div>

        {mode === 'invest' ? (
          <div className={styles.grid} style={{ marginTop: 12 }}>
            {shownProjects.map((p) => {
              const isFlagged = flagged.has(p.id);
              return (
                <div key={p.id} className={styles.card} id={`project-${p.id}`}>
                  <div className={styles.cardTop}>
                    <span className={styles.cardIcon} style={{ background: 'rgba(31,93,74,0.12)' }}>{p.icon}</span>
                    <div>
                      <div className={styles.cardTitle}>{p.title}</div>
                      <div className={styles.cardMeta}>{p.location} · {p.category}</div>
                    </div>
                  </div>
                  <p className={styles.cardDesc}>{p.description}</p>

                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${p.fundedPercent}%` }} />
                  </div>
                  <div className={styles.tagRow}>
                    <span className={`${styles.tag} ${styles.tagGreen}`}>{t('modulesPages.invest.fundedLabel', { percent: p.fundedPercent })}</span>
                    <span className={styles.tag}>{t('modulesPages.invest.durationLabel', { n: p.durationMonths })}</span>
                  </div>
                  <p className={styles.cardDesc} style={{ fontSize: 11.5, fontStyle: 'italic' }}>{p.targetReturnLabel}</p>

                  <div className={styles.cardFoot}>
                    <span className={styles.cardStat}>
                      {t('modulesPages.invest.goalLabel', { amount: formatCurrency(p.goalAmount) })}
                    </span>
                    <button
                      className={`${styles.actionBtn} ${isFlagged ? styles.actionBtnDone : ''}`}
                      disabled={isFlagged}
                      onClick={() => flagProject(p.id, p.title)}
                      id={`btn-project-interest-${p.id}`}
                    >
                      {isFlagged ? t('modulesPages.invest.interestedProject') : t('modulesPages.invest.interestProject')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.grid} style={{ marginTop: 12 }}>
            {shownCampaigns.map((c) => {
              const isSupported = supported.has(c.id);
              return (
                <div key={c.id} className={styles.card} id={`campaign-${c.id}`}>
                  <div className={styles.cardTop}>
                    <span className={styles.cardIcon} style={{ background: 'rgba(182,90,58,0.12)' }}>{c.icon}</span>
                    <div>
                      <div className={styles.cardTitle}>{c.title}</div>
                      <div className={styles.cardMeta}>{c.location} · {c.category}</div>
                    </div>
                  </div>
                  <p className={styles.cardDesc}>{c.description}</p>

                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${c.raisedPercent}%` }} />
                  </div>
                  <div className={styles.tagRow}>
                    <span className={`${styles.tag} ${styles.tagGold}`}>{t('modulesPages.invest.raisedLabel', { percent: c.raisedPercent })}</span>
                    <span className={styles.tag}>{t('modulesPages.invest.supportersLabel', { n: c.supporters })}</span>
                  </div>
                  <p className={styles.cardDesc} style={{ fontSize: 11.5, fontStyle: 'italic' }}>{t('modulesPages.invest.noReturnNote')}</p>

                  <div className={styles.cardFoot}>
                    <span className={styles.cardStat}>
                      {t('modulesPages.invest.goalLabel', { amount: formatCurrency(c.goalAmount) })}
                    </span>
                    <button
                      className={`${styles.actionBtn} ${isSupported ? styles.actionBtnDone : ''}`}
                      disabled={isSupported}
                      onClick={() => supportCampaign(c.id, c.title)}
                      id={`btn-support-${c.id}`}
                    >
                      {isSupported ? t('modulesPages.invest.supported') : t('modulesPages.invest.support')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        className={`${styles.actionBtn} ${on ? styles.actionBtnDone : ''}`}
        style={{ alignSelf: 'flex-start' }}
        onClick={onToggle}
        id="btn-invest-interest"
      >
        {on ? t('explore.interestOn') : t('explore.interestOff')}
      </button>

      <div>
        <h2 className={styles.sectionTitle}>{t('modulesPages.invest.bridgeTitle')}</h2>
        <div className={styles.bridgeRow} style={{ marginTop: 10 }}>
          <Link href="/growth" className={styles.bridgeLink}>🌱 {t('modulesPages.invest.bridgeGrowth')}</Link>
          <Link href="/simulator" className={styles.bridgeLink}>🧮 {t('modulesPages.invest.bridgeSimulator')}</Link>
        </div>
      </div>
    </div>
  );
}
