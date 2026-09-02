'use client';
// ============================================================
// KESSIA — Simulateurs (cahier des charges §20)
// Épargne · Tontine · Activité. Projections PURES, aucune promesse.
// ============================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './simulator.module.css';
import { projectSavings, type SavingsFrequency } from '@/lib/simulator/savings';
import { simulateTontine } from '@/lib/simulator/tontine';
import { projectBusiness } from '@/lib/simulator/business';
import { formatCurrency, formatDate, formatFrequency } from '@/lib/utils/format';
import { useTontineTypeList } from '@/lib/tontine/type-meta-i18n';
import { useT } from '@/lib/i18n';
import type { TontineType, TontineFrequency } from '@prisma/client';

const TAB_KEYS = [
  { key: 'savings', labelKey: 'simulator.tabSavings' },
  { key: 'tontine', labelKey: 'simulator.tabTontine' },
  { key: 'business', labelKey: 'simulator.tabBusiness' },
] as const;
type SimKey = (typeof TAB_KEYS)[number]['key'];

export default function SimulatorClient() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const sim = (params.get('sim') as SimKey) || 'savings';
  const setSim = (s: SimKey) => router.replace(`/simulator?sim=${s}`);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/home" className={styles.back} aria-label={t('simulator.back')}>←</Link>
        <div>
          <h1 className={styles.title}>{t('simulator.title')}</h1>
          <div className={styles.sub}>{t('simulator.subtitle')}</div>
        </div>
      </header>

      <div className={styles.tabs}>
        {TAB_KEYS.map((tab) => (
          <button key={tab.key} className={`${styles.tab} ${sim === tab.key ? styles.tabActive : ''}`} onClick={() => setSim(tab.key)}>
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {sim === 'savings' && <SavingsSim />}
        {sim === 'tontine' && <TontineSim />}
        {sim === 'business' && <BusinessSim />}

        <p className={styles.disclaimer}>{t('simulator.disclaimer')}</p>
      </div>
    </div>
  );
}

function Bars({ values, alt }: { values: number[]; alt?: boolean }) {
  const max = Math.max(1, ...values);
  return (
    <div className={styles.chart}>
      {values.map((v, i) => (
        <div key={i} className={`${styles.bar} ${alt ? styles.barAlt : ''}`} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className={styles.metric}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={`${styles.metricValue} ${tone === 'pos' ? styles.pos : tone === 'neg' ? styles.neg : ''}`}>{value}</div>
    </div>
  );
}

// ── Épargne ─────────────────────────────────────────────────
function SavingsSim() {
  const t = useT();
  const [initial, setInitial] = useState(20_000);
  const [contribution, setContribution] = useState(15_000);
  const [frequency, setFrequency] = useState<SavingsFrequency>('MONTHLY');
  const [months, setMonths] = useState(12);
  const [goal, setGoal] = useState(250_000);

  const r = useMemo(
    () => projectSavings({ initial, contribution, frequency, months, goalAmount: goal }),
    [initial, contribution, frequency, months, goal]
  );

  return (
    <>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t('simulator.savingsPlan')}</h2>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.startCapital')} <span className={styles.fieldValue}>{formatCurrency(initial)}</span></span>
          <input className={styles.range} type="range" min={0} max={500_000} step={5_000} value={initial} onChange={(e) => setInitial(+e.target.value)} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.contribution')} <span className={styles.fieldValue}>{formatCurrency(contribution)}</span></span>
          <input className={styles.range} type="range" min={1_000} max={200_000} step={1_000} value={contribution} onChange={(e) => setContribution(+e.target.value)} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.frequency')}</span>
          <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as SavingsFrequency)}>
            <option value="WEEKLY">{t('simulator.freqWeekly')}</option>
            <option value="BIWEEKLY">{t('simulator.freqBiweekly')}</option>
            <option value="MONTHLY">{t('simulator.freqMonthly')}</option>
          </select>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.duration')} <span className={styles.fieldValue}>{t('simulator.months', { count: months })}</span></span>
          <input className={styles.range} type="range" min={1} max={60} step={1} value={months} onChange={(e) => setMonths(+e.target.value)} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.targetAmount')} <span className={styles.fieldValue}>{formatCurrency(goal)}</span></span>
          <input className={styles.range} type="range" min={0} max={2_000_000} step={10_000} value={goal} onChange={(e) => setGoal(+e.target.value)} />
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t('simulator.projection')}</h2>
        <div className={styles.result}>
          <Metric label={t('simulator.totalContributed')} value={formatCurrency(r.totalContributed)} />
          <Metric label={t('simulator.capitalAt', { months })} value={formatCurrency(r.finalBalance)} tone="pos" />
        </div>
        <Bars values={r.points.map((p) => p.balance)} />
        {r.goal && (
          <div className={styles.callout} style={{ marginTop: 12 }}>
            {r.goal.reached
              ? t('simulator.goalReached', { amount: formatCurrency(r.goal.amount), month: r.goal.monthReached ?? '' })
              : t('simulator.goalMissed', {
                  shortfall: formatCurrency(r.goal.shortfall),
                  amount: formatCurrency(r.goal.amount),
                  months,
                  monthly: formatCurrency(r.goal.requiredMonthly),
                })}
          </div>
        )}
      </div>
    </>
  );
}

// ── Tontine ─────────────────────────────────────────────────
function TontineSim() {
  const t = useT();
  const typeList = useTontineTypeList();
  const [type, setType] = useState<TontineType>('CLASSIC_ROTATING');
  const [amount, setAmount] = useState(25_000);
  const [members, setMembers] = useState(6);
  const [frequency, setFrequency] = useState<TontineFrequency>('MONTHLY');
  const [position, setPosition] = useState(3);

  const r = useMemo(
    () => simulateTontine({ type, amount, members, frequency, myPosition: Math.min(position, members) }),
    [type, amount, members, frequency, position]
  );

  const positionNote = (() => {
    const total = formatCurrency(amount * r.totalRounds);
    switch (r.positionKind) {
      case 'growth': return t('simulator.posGrowth', { amount: formatCurrency(amount), total });
      case 'projectOrganizer': return t('simulator.posProjectOrganizer', { pot: formatCurrency(r.potPerRound) });
      case 'projectContributor': return t('simulator.posProjectContributor', { amount: formatCurrency(amount) });
      case 'rotatingEarly': return t('simulator.posRotatingEarly', { pos: r.myPosition, members });
      case 'rotatingLate': return t('simulator.posRotatingLate', { pos: r.myPosition, members, rounds: r.totalRounds });
      default: return t('simulator.posRotatingMid', { pos: r.myPosition, members });
    }
  })();

  return (
    <>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t('simulator.tontineParams')}</h2>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.type')}</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as TontineType)}>
            {typeList.map((m) => <option key={m.key} value={m.key}>{m.icon} {m.label}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.contributionPerRound')} <span className={styles.fieldValue}>{formatCurrency(amount)}</span></span>
          <input className={styles.range} type="range" min={1_000} max={200_000} step={1_000} value={amount} onChange={(e) => setAmount(+e.target.value)} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.memberCount')} <span className={styles.fieldValue}>{members}</span></span>
          <input className={styles.range} type="range" min={2} max={20} step={1} value={members} onChange={(e) => setMembers(+e.target.value)} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.frequency')}</span>
          <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as TontineFrequency)}>
            {(['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as TontineFrequency[]).map((f) => <option key={f} value={f}>{formatFrequency(f)}</option>)}
          </select>
        </div>
        {r.distribution === 'rotating' && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('simulator.myPosition')} <span className={styles.fieldValue}>{Math.min(position, members)} / {members}</span></span>
            <input className={styles.range} type="range" min={1} max={members} step={1} value={Math.min(position, members)} onChange={(e) => setPosition(+e.target.value)} />
          </div>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t('simulator.tontineResult')}</h2>
        <div className={styles.result}>
          <Metric label={t('simulator.potPerRound')} value={formatCurrency(r.potPerRound)} />
          <Metric label={t('simulator.cycleDuration')} value={t('simulator.roundsCount', { count: r.totalRounds })} />
          <Metric label={t('simulator.youPay')} value={formatCurrency(r.myTotalPaid)} tone="neg" />
          <Metric label={t('simulator.youReceive')} value={formatCurrency(r.myTotalReceived)} tone="pos" />
        </div>
        <div className={styles.callout} style={{ marginTop: 12 }}>{positionNote}</div>
        <div className={styles.rowList}>
          {r.rounds.map((rd) => (
            <div key={rd.round} className={styles.row}>
              <span className={styles.rowLabel}>{t('simulator.round', { n: rd.round, date: formatDate(rd.dueDate) })}</span>
              <span>
                {rd.iReceive > 0 ? `+${formatCurrency(rd.iReceive)}` : `−${formatCurrency(rd.iPay)}`}
                {` · ${t('simulator.netLabel')} `}{rd.cumulativeNet >= 0 ? '+' : '−'}{formatCurrency(Math.abs(rd.cumulativeNet))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Activité ────────────────────────────────────────────────
function BusinessSim() {
  const t = useT();
  const [revenue, setRevenue] = useState(150_000);
  const [growth, setGrowth] = useState(8);
  const [margin, setMargin] = useState(30);
  const [expenses, setExpenses] = useState(60_000);
  const [months, setMonths] = useState(12);

  const r = useMemo(
    () => projectBusiness({ monthlyRevenue: revenue, monthlyGrowthPct: growth, marginRatePct: margin, monthlyExpenses: expenses, months }),
    [revenue, growth, margin, expenses, months]
  );

  return (
    <>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t('simulator.assumptions')}</h2>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.currentRevenue')} <span className={styles.fieldValue}>{formatCurrency(revenue)}</span></span>
          <input className={styles.range} type="range" min={0} max={2_000_000} step={10_000} value={revenue} onChange={(e) => setRevenue(+e.target.value)} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.targetGrowth')} <span className={styles.fieldValue}>{t('simulator.percent', { value: growth })}</span></span>
          <input className={styles.range} type="range" min={-20} max={30} step={1} value={growth} onChange={(e) => setGrowth(+e.target.value)} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.grossMarginRate')} <span className={styles.fieldValue}>{t('simulator.percent', { value: margin })}</span></span>
          <input className={styles.range} type="range" min={0} max={90} step={1} value={margin} onChange={(e) => setMargin(+e.target.value)} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.fixedExpenses')} <span className={styles.fieldValue}>{formatCurrency(expenses)}</span></span>
          <input className={styles.range} type="range" min={0} max={1_000_000} step={5_000} value={expenses} onChange={(e) => setExpenses(+e.target.value)} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('simulator.horizon')} <span className={styles.fieldValue}>{t('simulator.months', { count: months })}</span></span>
          <input className={styles.range} type="range" min={3} max={24} step={1} value={months} onChange={(e) => setMonths(+e.target.value)} />
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>{t('simulator.projection')}</h2>
        <div className={styles.result}>
          <Metric label={t('simulator.revenueAt', { months })} value={formatCurrency(r.endRevenue)} tone="pos" />
          <Metric label={t('simulator.cumulativeProfit')} value={formatCurrency(r.totalProfit)} tone={r.totalProfit >= 0 ? 'pos' : 'neg'} />
          <Metric label={t('simulator.breakEven')} value={formatCurrency(r.breakEvenRevenue)} />
          <Metric label={t('simulator.turnGreen')} value={r.breakEvenMonth ? t('simulator.monthN', { n: r.breakEvenMonth }) : t('simulator.beyondHorizon')} tone={r.breakEvenMonth ? 'pos' : 'neg'} />
        </div>
        <Bars values={r.points.map((p) => p.revenue)} alt />
        <div className={styles.callout} style={{ marginTop: 12 }}>
          {r.breakEvenMonth
            ? t('simulator.breakEvenReached', { growth, margin, month: r.breakEvenMonth })
            : t('simulator.breakEvenMissed', { amount: formatCurrency(r.breakEvenRevenue) })}
        </div>
      </div>
    </>
  );
}
