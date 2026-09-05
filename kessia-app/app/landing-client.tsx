'use client';
// ============================================================
// KESSIA — Landing (Client Component)
// Traduite FR / EN (§38). La <metadata> reste côté serveur (page.tsx).
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { KessiaLogo } from '@/components/design-system/ui/KessiaLogo';
import { DiscoveryRail } from '@/components/discover/DiscoveryRail';
import { MarketplaceRail } from '@/components/discover/MarketplaceRail';
import { useT } from '@/lib/i18n';

export default function LandingClient() {
  const t = useT();
  const [showTop, setShowTop] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 700);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { key: 'navHome', anchor: '#accueil' },
    { key: 'navAgencies', anchor: '#agences' },
    { key: 'navServices', anchor: '#services' },
    { key: 'navResources', anchor: '#ressources' },
    { key: 'navOpenTontines', anchor: '#tontines-ouvertes' },
    { key: 'navCommunityMarket', anchor: '#marketplace-communaute' },
    { key: 'navContact', anchor: '#contact' },
  ] as const;

  const pillars = [
    { value: t('landing.pillar1Value'), label: t('landing.pillar1Label') },
    { value: t('landing.pillar2Value'), label: t('landing.pillar2Label') },
    { value: t('landing.pillar3Value'), label: t('landing.pillar3Label') },
    { value: t('landing.pillar4Value'), label: t('landing.pillar4Label') },
  ];

  const features = [
    { icon: '💰', title: t('landing.feat1Title'), color: 'primary', desc: t('landing.feat1Desc') },
    { icon: '🏪', title: t('landing.feat2Title'), color: 'green', desc: t('landing.feat2Desc') },
    { icon: '🛒', title: t('landing.feat3Title'), color: 'gold', desc: t('landing.feat3Desc') },
    { icon: '🎓', title: t('landing.feat4Title'), color: 'green', desc: t('landing.feat4Desc') },
    { icon: '🤝', title: t('landing.feat5Title'), color: 'primary', desc: t('landing.feat5Desc') },
    { icon: '📈', title: t('landing.feat6Title'), color: 'gold', desc: t('landing.feat6Desc') },
  ];

  const steps = [
    { n: '01', icon: '📱', title: t('landing.step1Title'), desc: t('landing.step1Desc') },
    { n: '02', icon: '🛡️', title: t('landing.step2Title'), desc: t('landing.step2Desc') },
    { n: '03', icon: '🚀', title: t('landing.step3Title'), desc: t('landing.step3Desc') },
  ];

  const footerCols = [
    {
      title: t('landing.footerColProduct'),
      links: [
        { label: t('landing.footerFeatures'), href: '#services' },
        { label: t('landing.footerCreate'), href: '/register' },
        { label: t('landing.footerLogin'), href: '/login' },
      ],
    },
    {
      title: t('landing.footerColLegal'),
      links: [
        { label: t('landing.footerTerms'), href: '/legal/terms' },
        { label: t('landing.footerPrivacy'), href: '/legal/privacy' },
        { label: t('landing.footerMentions'), href: '/legal/mentions' },
      ],
    },
    {
      title: t('landing.footerColSupport'),
      links: [
        { label: t('landing.footerHelp'), href: '/support' },
        { label: t('landing.footerContact'), href: 'mailto:contact@kessia.app' },
      ],
    },
  ];

  return (
    <div className={styles.page}>

      {/* ═══ HEADER / NAV ═══ */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.logoLink} id="logo-home">
            <KessiaLogo size={32} variant="full" />
          </Link>

          <nav className={styles.nav} aria-label={t('landing.navPrimary')}>
            {navLinks.map((link) => (
              <a key={link.key} href={link.anchor} className={styles.navLink}>
                {t(`landing.${link.key}`)}
              </a>
            ))}
          </nav>

          <div className={styles.headerActions}>
            <Link href="/login" className="btn btn-ghost btn-sm" id="btn-header-login">
              {t('landing.login')}
            </Link>
            <Link href="/onboarding" className="btn btn-primary btn-sm" id="btn-header-register">
              {t('landing.start')}
            </Link>
          </div>

          <button
            className={`${styles.menuBtn} ${menuOpen ? styles.menuBtnOpen : ''}`}
            id="btn-mobile-menu"
            aria-label={t('landing.menu')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span /><span /><span />
          </button>
        </div>

        {menuOpen && (
          <div className={styles.mobileMenu} id="mobile-menu">
            {navLinks.map((link) => (
              <a
                key={link.key}
                href={link.anchor}
                className={styles.mobileMenuLink}
                onClick={() => setMenuOpen(false)}
              >
                {t(`landing.${link.key}`)}
              </a>
            ))}
            <div className={styles.mobileMenuActions}>
              <Link href="/login" className="btn btn-ghost btn-sm" onClick={() => setMenuOpen(false)}>
                {t('landing.login')}
              </Link>
              <Link href="/onboarding" className="btn btn-primary btn-sm" onClick={() => setMenuOpen(false)}>
                {t('landing.start')}
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ═══ HERO ═══ */}
      <section className={styles.hero} id="accueil">
        <div className={styles.heroBg} />
        <div className={styles.heroContent}>
          <div className={styles.heroLeft}>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot} />
              {t('landing.heroBadge')}
            </div>

            <h1 className={styles.heroTitle}>
              {t('landing.heroTitle1')}<br />
              <span className={styles.heroTitleLine2}>{t('landing.heroTitle2')}</span><br />
              <span className={styles.heroTitleAccent}>{t('landing.heroTitle3')}</span>
            </h1>

            <p className={styles.heroTagline}>
              <span className={styles.taglineNormal}>{t('landing.taglineSave')}</span>{' '}
              <span className={styles.taglineAccent}>{t('landing.taglineBuild')}</span>{' '}
              <span className={styles.taglineNormal}>{t('landing.taglineGrow')}</span>
            </p>

            <p className={styles.heroDesc}>{t('landing.heroDesc')}</p>

            <div className={styles.heroActions}>
              <Link href="/onboarding" className="btn btn-primary btn-lg" id="btn-hero-start">
                {t('landing.ctaStartFree')}
              </Link>
              <Link href="/login" className="btn btn-secondary btn-lg" id="btn-hero-login">
                {t('landing.login')}
              </Link>
            </div>

            <div className={styles.heroTrust}>
              <span>{t('landing.trustSecure')}</span>
              <span>{t('landing.trustCompliant')}</span>
              <span>{t('landing.trustPlatforms')}</span>
              <span>{t('landing.trustMade')}</span>
            </div>
          </div>

          <div className={styles.heroRight}>
            <div className={styles.heroImageWrapper}>
              <div className={styles.heroImageCard}>
                <div className={styles.appPreviewCard}>
                  <div className={styles.appPreviewHeader}>
                    <div className={styles.appPreviewLogo}>
                      <KessiaLogo size={20} variant="full" />
                    </div>
                  </div>
                  <div className={styles.appPreviewBalance}>
                    <div className={styles.appPreviewLabel}>{t('landing.previewBalanceLabel')}</div>
                    <div className={styles.appPreviewAmount}>135 750 FCFA</div>
                    <div className={styles.appPreviewSub}>{t('landing.previewBalanceSub')}</div>
                  </div>
                  <div className={styles.appPreviewServices}>
                    {['💰 Wallet', '🔄 Tontine', '🏪 Business', '🛒 Market'].map((s) => (
                      <div key={s} className={styles.appPreviewSvc}>{s}</div>
                    ))}
                  </div>
                  <div className={styles.appPreviewTx}>
                    <div className={styles.appPreviewTxItem}>
                      <span>🔄 Tontine Groupe A</span>
                      <span className={styles.txGreen}>+40 000 FCFA</span>
                    </div>
                    <div className={styles.appPreviewTxItem}>
                      <span>🏪 Paiement marchand</span>
                      <span className={styles.txRed}>-15 000 FCFA</span>
                    </div>
                    <div className={styles.appPreviewTxItem}>
                      <span>📱 Recharge Orange</span>
                      <span className={styles.txGreen}>+25 000 FCFA</span>
                    </div>
                  </div>
                </div>

                <div className={styles.floatBadge1}>
                  <span>🔄</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{t('landing.previewTontineActive')}</div>
                    <div style={{ fontSize: 10, color: '#9C8E7E' }}>750 000 FCFA</div>
                  </div>
                </div>
                <div className={styles.floatBadge2}>
                  <span style={{ fontSize: 18 }}>⭐</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{t('landing.previewScore')}</div>
                    <div style={{ fontSize: 10, color: '#D6A84F' }}>{t('landing.previewScoreRating')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <a href="#services" className={styles.scrollCue} aria-label={t('landing.scrollDown')}>
          <span>{t('landing.scrollDown')}</span>
          <span className={styles.scrollCueArrow} aria-hidden>↓</span>
        </a>
      </section>

      {/* ═══ STATS ═══ */}
      <section className={styles.statsSection} id="stats">
        <div className={styles.statsInner}>
          {pillars.map((p) => (
            <div key={p.value} className={styles.statItem}>
              <div className={styles.statValue}>{p.value}</div>
              <div className={styles.statLabel}>{p.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className={styles.features} id="services">
        <div className={styles.featuresInner}>
          <div className={styles.sectionBadge}>{t('landing.featuresBadge')}</div>
          <h2 className={styles.sectionTitle}>{t('landing.featuresTitle')}</h2>
          <p className={styles.sectionSubtitle}>{t('landing.featuresSubtitle')}</p>
          <div className={styles.featuresGrid}>
            {features.map((f) => (
              <div key={f.title} className={`${styles.featureCard} ${styles[`featureCard_${f.color}`]}`}>
                <div className={styles.featureIcon}>{f.icon}</div>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className={styles.howItWorks} id="ressources">
        <div className={styles.howInner}>
          <div className={styles.sectionBadge}>{t('landing.howBadge')}</div>
          <h2 className={styles.sectionTitle}>{t('landing.howTitle')}</h2>
          <div className={styles.steps}>
            {steps.map((s) => (
              <div key={s.n} className={styles.step}>
                <div className={styles.stepNum}>{s.n}</div>
                <div className={styles.stepIcon}>{s.icon}</div>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepDesc}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DÉCOUVERTE — tontines ouvertes + marketplace ═══ */}
      <section className={styles.discover} id="decouverte">
        <div className={styles.discoverInner} style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
          <div id="tontines-ouvertes" className={styles.railAnchor}>
            <DiscoveryRail context="landing" limit={12} autoScroll />
          </div>
          <div id="marketplace-communaute" className={styles.railAnchor}>
            <MarketplaceRail source="discover" limit={12} autoScroll />
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className={styles.cta}>
        <div className={styles.ctaInner}>
          <div className={styles.ctaLogo}>
            <KessiaLogo size={40} variant="white" />
          </div>
          <h2 className={styles.ctaTitle}>{t('landing.ctaTitle')}</h2>
          <p className={styles.ctaSubtitle}>{t('landing.ctaSubtitle')}</p>
          <Link href="/onboarding" className="btn btn-gold btn-xl" id="btn-cta-register">
            {t('landing.ctaButton')}
          </Link>
          <p className={styles.ctaNote}>{t('landing.ctaNote')}</p>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}>
            <KessiaLogo size={28} variant="white" />
            <p className={styles.footerTagline}>
              {t('landing.footerTagline1')}<br />
              <em>{t('landing.footerTagline2')}</em><br />
              {t('landing.footerTagline3')}
            </p>
            <div className={styles.footerContact}>
              <span>📞 +228 90 00 00 00</span>
              <span>✉️ contact@kessia.app</span>
              <span>🌐 www.kessia.app</span>
            </div>
          </div>
          <div className={styles.footerLinks}>
            {footerCols.map((col) => (
              <div key={col.title} className={styles.footerCol}>
                <div className={styles.footerColTitle}>{col.title}</div>
                {col.links.map((l) => (
                  <a key={l.label} href={l.href} className={styles.footerLink}>{l.label}</a>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p>{t('landing.footerRights')}</p>
          <p>{t('landing.footerMade')}</p>
        </div>
      </footer>

      <a
        href="#accueil"
        className={`${styles.toTop} ${showTop ? styles.toTopVisible : ''}`}
        aria-label={t('landing.backToTop')}
        title={t('landing.backToTop')}
      >
        ↑
      </a>
    </div>
  );
}
