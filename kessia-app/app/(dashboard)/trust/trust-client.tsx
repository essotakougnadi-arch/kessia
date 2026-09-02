'use client';
// ============================================================
// KESSIA — Trust Center (cahier des charges §21)
// Transparence : tarifs, plafonds KYC, données, sécurité, garantie.
// ============================================================

import Link from 'next/link';
import styles from './trust.module.css';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { useTrust } from '@/hooks/useTrust';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';

export default function TrustClient() {
  const t = useT();
  const { trust, isLoading, error, refresh } = useTrust();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/profile" className={styles.back} aria-label={t('trust.back')}>←</Link>
        <div>
          <h1 className={styles.title}>{t('trust.title')}</h1>
          <div className={styles.sub}>{t('trust.subtitle')}</div>
        </div>
      </header>

      {error && !isLoading && <ErrorNote message={t('trust.loadError')} onRetry={refresh} />}

      <div className={styles.body}>
        {isLoading && !trust && <p className={styles.meta} style={{ padding: 20 }}>{t('trust.loading')}</p>}

        {trust && (
          <>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('trust.fees')}</h2>
              {trust.fees.map((f) => (
                <div key={f.key} className={styles.row}>
                  <div>
                    <div className={styles.rowLabel}>{f.label}</div>
                    <div className={styles.rowDetail}>{f.detail}</div>
                  </div>
                  <div className={styles.rowValue}>{f.fee}</div>
                </div>
              ))}
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('trust.kycLimits')}</h2>
              <div className={styles.rowLabel}>{trust.kyc.limits.label}</div>
              <div className={styles.bar}>
                <div
                  className={styles.barFill}
                  style={{ width: `${Math.min(100, (trust.kyc.usedThisMonth / trust.kyc.limits.monthlyOutbound) * 100)}%` }}
                />
              </div>
              <div className={styles.meta}>
                {t('trust.usageThisMonth', {
                  used: formatCurrency(trust.kyc.usedThisMonth),
                  remaining: formatCurrency(trust.kyc.remainingThisMonth),
                  perTx: formatCurrency(trust.kyc.limits.perTransaction),
                })}
              </div>
              <div className={styles.tierGrid}>
                {trust.kyc.allTiers.map((tier) => (
                  <div key={tier.tier} className={`${styles.tier} ${tier.tier === trust.kyc.tier ? styles.tierActive : ''}`}>
                    <div className={styles.tierName}>{tier.label}</div>
                    <div>{t('trust.perOperation', { amount: formatCurrency(tier.perTransaction) })}</div>
                    <div>{t('trust.perMonth', { amount: formatCurrency(tier.monthlyOutbound) })}</div>
                  </div>
                ))}
              </div>
              {trust.kyc.tier < 2 && (
                <Link href="/profile/kyc" className={styles.link}>{t('trust.raiseLimits')}</Link>
              )}
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('trust.security')}</h2>
              <div className={styles.row}>
                <div className={styles.rowLabel}>{t('trust.twoFactor')}</div>
                <span className={`${styles.pill} ${trust.security.twoFactorEnabled ? styles.pillOk : styles.pillWarn}`}>
                  {trust.security.twoFactorEnabled ? t('trust.twoFactorOn') : t('trust.twoFactorOff')}
                </span>
              </div>
              <div className={styles.row}>
                <div className={styles.rowLabel}>{t('trust.activeSessions')}</div>
                <div className={styles.rowValue}>{trust.security.activeSessions}</div>
              </div>
              <Link href={trust.security.manageUrl} className={styles.link}>{t('trust.manageSecurity')}</Link>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('trust.yourData')}</h2>
              <div className={styles.row}>
                <div className={styles.rowLabel}>{t('trust.exportRequest')}</div>
                <div className={styles.rowValue}>
                  {trust.dataRights.exportRequestedAt ? formatDate(trust.dataRights.exportRequestedAt) : t('trust.none')}
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.rowLabel}>{t('trust.deletionRequest')}</div>
                <div className={styles.rowValue}>
                  {trust.dataRights.deletionRequestedAt ? formatDate(trust.dataRights.deletionRequestedAt) : t('trust.none')}
                </div>
              </div>
              <Link href={trust.dataRights.manageUrl} className={styles.link}>{t('trust.manageData')}</Link>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('trust.guaranteeFund')}</h2>
              <div className={styles.row}>
                <div className={styles.rowLabel}>{t('trust.mode')}</div>
                <span className={`${styles.pill} ${styles.pillWarn}`}>{t('trust.demoMode')}</span>
              </div>
              <div className={styles.meta}>{trust.guaranteeFund.note}</div>
              <Link href="/tontine/garantie" className={styles.link}>{t('trust.learnMore')}</Link>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('trust.legalDocs')}</h2>
              <div className={styles.row}>
                <div className={styles.rowLabel}>{t('trust.acceptedVersion')}</div>
                <span className={`${styles.pill} ${trust.legal.upToDate ? styles.pillOk : styles.pillWarn}`}>
                  {trust.legal.acceptedVersion
                    ? (trust.legal.upToDate ? t('trust.upToDate') : t('trust.versionLabel', { version: trust.legal.acceptedVersion }))
                    : t('trust.notRecorded')}
                </span>
              </div>
              <div className={styles.meta}>
                {t('trust.currentVersion', { version: trust.legal.currentVersionLabel })}
                {trust.legal.acceptedAt ? ` · ${t('trust.acceptedOn', { date: formatDate(trust.legal.acceptedAt) })}` : ''}
              </div>
              <Link href="/legal/terms" className={styles.link}>{t('trust.termsLink')}</Link>{' '}
              <Link href="/legal/privacy" className={styles.link}>{t('trust.privacyLink')}</Link>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{t('trust.regulatoryNotices')}</h2>
              {trust.disclaimers.map((d, i) => (
                <p key={i} className={styles.disclaimer}>{d}</p>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
