'use client';
// ============================================================
// KESSIA — Data & Analytics (cahier des charges §28) + priorités
// du jour (Admin Copilot §17). Agrégats uniquement, pas de nominatif.
// ============================================================

import styles from '../admin.module.css';
import { useAdminAnalytics } from '@/hooks/useAdmin';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';

const SEV_PILL: Record<string, string> = { urgent: 'p_red', warn: 'p_amber', info: 'p_blue' };

const KYC_COLOR: Record<string, string> = {
  VERIFIED: 'var(--color-green, #1F5D4A)',
  UNDER_REVIEW: 'var(--color-amber, #96650F)',
  IN_PROGRESS: 'var(--color-primary, #B65A3A)',
  ACTION_REQUIRED: 'var(--color-amber, #96650F)',
  REJECTED: 'var(--color-danger, #97261A)',
  EXPIRED: 'var(--color-border)',
  NOT_STARTED: 'var(--color-border)',
};

export default function AdminAnalyticsPage() {
  const t = useT();
  const { data, isLoading } = useAdminAnalytics();
  const a = data?.analytics;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.h1}>{t('admin.analytics.title')}</h1>
      <p className={styles.lede}>{t('admin.analytics.lede')}</p>

      {isLoading && !a && <div className={styles.empty}>{t('admin.analytics.loading')}</div>}

      {data && data.priorities.length > 0 && (
        <div className={styles.card} style={{ marginBottom: 20, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>{t('admin.analytics.prioritiesTitle')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.priorities.map((p) => (
              <a key={p.id} href={p.href} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textDecoration: 'none', color: 'inherit', padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 18 }}>{p.icon}</span>
                <span style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: 13 }}>{p.title}</strong>
                  <span className={styles.muted}>{p.detail}</span>
                </span>
                <span className={`${styles.pill} ${styles[SEV_PILL[p.severity]]}`}>{t(`admin.analytics.sev.${p.severity}`)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {a && (
        <>
          <Grid title={t('admin.analytics.gMembers')}>
            <Kpi label={t('admin.analytics.kTotal')} value={String(a.users.total)} />
            <Kpi label={t('admin.analytics.kVerifiedKyc')} value={`${a.users.verified} (${a.users.total ? Math.round((a.users.verified / a.users.total) * 100) : 0} %)`} />
            <Kpi label={t('admin.analytics.kActivated')} value={`${a.users.activated} (${a.users.activatedRate} %)`} />
            <Kpi label={t('admin.analytics.kActive7d')} value={String(a.users.active7d)} />
            <Kpi label={t('admin.analytics.kActive30d')} value={String(a.users.active30d)} />
            <Kpi label={t('admin.analytics.kStickiness')} value={a.users.stickiness != null ? `${a.users.stickiness} %` : '—'} />
            <Kpi label={t('admin.analytics.kNew7d')} value={String(a.users.last7d)} />
            <Kpi label={t('admin.analytics.kNew30d')} value={String(a.users.last30d)} />
          </Grid>

          <div className={styles.card} style={{ padding: 16, marginTop: 12 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800 }}>{t('admin.analytics.kycFunnelTitle')}</h3>
            <MixBar
              segments={a.users.kycFunnel.map((f) => ({
                label: t(`admin.pill.kyc.${f.status}`),
                value: f.count,
                color: KYC_COLOR[f.status] ?? 'var(--color-border)',
              }))}
            />
          </div>

          <Grid title={t('admin.analytics.gFinance')}>
            <Kpi label={t('admin.analytics.kFeesEarned30d')} value={formatCurrency(a.finance.feesEarned30d)} />
            <Kpi label={t('admin.analytics.kFeesEarnedTotal')} value={formatCurrency(a.finance.feesEarnedTotal)} />
            <Kpi label={t('admin.analytics.kNetInflow30d')} value={formatCurrency(a.finance.netInflow30d)} />
            <Kpi label={t('admin.analytics.kWithdrawals30d')} value={formatCurrency(a.finance.withdrawalVolume30d)} />
            <Kpi label={t('admin.analytics.kTransferVol30d')} value={formatCurrency(a.finance.transferVolume30d)} />
            <Kpi label={t('admin.analytics.kPayoutVol30d')} value={formatCurrency(a.finance.payoutVolume30d)} />
            <Kpi label={t('admin.analytics.kAvgUserBalance')} value={formatCurrency(a.finance.avgUserBalance)} />
            <Kpi label={t('admin.analytics.kExpenseVol30d')} value={formatCurrency(a.business.expenseVolume30d)} />
          </Grid>

          <Grid title={t('admin.analytics.gWallet')}>
            <Kpi label={t('admin.analytics.kTotalHeld')} value={formatCurrency(a.wallet.totalHeld)} />
            <Kpi label={t('admin.analytics.kVolume30d')} value={formatCurrency(a.wallet.volume30d)} />
            <Kpi label={t('admin.analytics.kTx30d')} value={String(a.wallet.txCount30d)} />
            <Kpi label={t('admin.analytics.kDeposits30d')} value={formatCurrency(a.wallet.depositVolume30d)} />
          </Grid>

          <Grid title={t('admin.analytics.gAi')}>
            <Kpi label={t('admin.analytics.kAiConv30d')} value={String(a.ai.conversations30d)} />
            <Kpi label={t('admin.analytics.kAiMsg30d')} value={String(a.ai.messages30d)} />
            <Kpi label={t('admin.analytics.kAiUsers30d')} value={String(a.ai.usersEngaged30d)} />
            <Kpi label={t('admin.analytics.kAiConvTotal')} value={String(a.ai.conversations)} />
          </Grid>

          <div className={styles.card} style={{ padding: 16, marginTop: 12 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800 }}>{t('admin.analytics.aiAnswerMixTitle')}</h3>
            <MixBar
              segments={[
                { label: t('admin.analytics.aiSrcData'), value: a.ai.answerMix.data, color: 'var(--color-green)', suffix: '%' },
                { label: t('admin.analytics.aiSrcKb'), value: a.ai.answerMix.kb, color: 'var(--color-primary)', suffix: '%' },
                { label: t('admin.analytics.aiSrcFallback'), value: a.ai.answerMix.fallback, color: 'var(--color-amber, #96650F)', suffix: '%' },
                { label: t('admin.analytics.aiSrcUnknown'), value: a.ai.answerMix.unknown, color: 'var(--color-border)', suffix: '%' },
              ].filter((s) => s.value > 0)}
            />
          </div>

          <Grid title={t('admin.analytics.gTontines')}>
            <Kpi label={t('admin.analytics.kTotal')} value={String(a.tontines.total)} />
            <Kpi label={t('admin.analytics.kEscrowHeld')} value={formatCurrency(a.tontines.escrowHeld)} />
            <Kpi label={t('admin.analytics.kPotInPlay')} value={formatCurrency(a.tontines.potInPlay)} />
            <Kpi label={t('admin.analytics.kOnTime')} value={a.tontines.contributionOnTimeRate != null ? `${a.tontines.contributionOnTimeRate} %` : '—'} />
            <Kpi label={t('admin.analytics.kByStatus')} value={a.tontines.byStatus.map((s) => `${s.status}:${s.count}`).join(' · ') || '—'} />
          </Grid>

          <Grid title={t('admin.analytics.gBusiness')}>
            <Kpi label={t('admin.analytics.kActivities')} value={String(a.business.activities)} />
            <Kpi label={t('admin.analytics.kSales30d')} value={String(a.business.sales30d)} />
            <Kpi label={t('admin.analytics.kSalesVolume30d')} value={formatCurrency(a.business.salesVolume30d)} />
            <Kpi label={t('admin.analytics.kInvoicesOutstanding')} value={String(a.business.invoicesOutstanding)} />
          </Grid>

          <Grid title={t('admin.analytics.gRisk')}>
            <Kpi label={t('admin.analytics.kFraudOpen')} value={String(a.risk.fraudAlertsOpen)} />
            <Kpi label={t('admin.analytics.kGuaranteePending')} value={String(a.risk.guaranteeClaimsPending)} />
            <Kpi label={t('admin.analytics.kLateContrib')} value={String(a.risk.lateContributions)} />
            <Kpi label={t('admin.analytics.kStepsDone')} value={String(a.growth.stepsDone)} />
          </Grid>

          <div className={styles.card} style={{ padding: 16, marginTop: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>{t('admin.analytics.chartTx')}</h3>
            <Spark values={a.timeseries.map((ts) => ts.txVolume)} />
            <h3 style={{ margin: '16px 0 12px', fontSize: 14, fontWeight: 800 }}>{t('admin.analytics.chartSignups')}</h3>
            <Spark values={a.timeseries.map((ts) => ts.signups)} accent />
          </div>
          <p className={styles.muted} style={{ marginTop: 10 }}>
            {t('admin.analytics.generatedAt', { date: formatDate(a.generatedAt) })}
          </p>
        </>
      )}
    </div>
  );
}

function Grid({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>{children}</div>
    </div>
  );
}
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, marginTop: 3 }}>{value}</div>
    </div>
  );
}
function MixBar({ segments }: { segments: Array<{ label: string; value: number; color: string; suffix?: string }> }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: 'var(--color-border)' }}>
        {segments.map((s, i) => (
          <div key={i} title={`${s.label} · ${s.value}${s.suffix ?? ''}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 8 }}>
        {segments.map((s, i) => (
          <span key={i} style={{ fontSize: 11, color: 'var(--color-text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
            {s.label} · <b style={{ color: 'var(--color-text)' }}>{s.value}{s.suffix ?? ''}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
function Spark({ values, accent }: { values: number[]; accent?: boolean }) {
  const max = Math.max(1, ...values);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 70 }}>
      {values.map((v, i) => (
        <div key={i} style={{ flex: 1, minHeight: 2, height: `${Math.max(2, (v / max) * 100)}%`, background: accent ? 'var(--color-green)' : 'var(--color-primary)', borderRadius: 2, opacity: 0.85 }} />
      ))}
    </div>
  );
}
