'use client';
// ============================================================
// KESSIA — Contrat numérique de tontine (§6.4)
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import styles from './contract.module.css';
import { useTontineAgreement } from '@/hooks/useTontineAgreement';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { ErrorNote } from '@/components/ui/ErrorNote';

function fdate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}
function fnum(v: number) {
  return v.toLocaleString('fr-FR');
}

export default function ContractClient({ id }: { id: string }) {
  const meId = useAuthStore((s) => s.user?.id);
  const addToast = useUiStore((s) => s.addToast);
  const { agreement, isLoading, error, refresh, accept } = useTontineAgreement(id);
  const [busy, setBusy] = useState(false);

  async function onAccept() {
    setBusy(true);
    const r = await accept();
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
  }

  const terms = agreement?.terms;
  const myAcceptance = agreement?.acceptances.find((a) => a.userId === meId);
  const needsExplicitAccept =
    agreement?.finalized &&
    myAcceptance &&
    agreement.generatedAt &&
    (!myAcceptance.acceptedAt || new Date(myAcceptance.acceptedAt) < new Date(agreement.generatedAt));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={`/tontine/${id}`} className={styles.back} aria-label="Retour">←</Link>
        <div>
          <h1 className={styles.title}>Contrat de la tontine</h1>
          <div className={styles.sub}>{terms?.tontine.name ?? '…'}</div>
        </div>
      </header>

      {error && !isLoading && (
        <ErrorNote message="Impossible de charger le contrat." onRetry={refresh} />
      )}

      {isLoading && !terms && (
        <div className={styles.section}><p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>Chargement…</p></div>
      )}

      {terms && (
        <>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {terms.tontine.typeLabel}
              <span className={`${styles.badge} ${!agreement?.finalized ? styles.badgeDraft : ''}`}>
                {agreement?.finalized ? `Figé le ${fdate(agreement.generatedAt)}` : 'Aperçu — non figé'}
              </span>
            </h2>
            <p className={styles.lead}>{terms.tontine.objet}</p>
            <div className={styles.kv}>
              <div className={styles.kvItem}>
                <div className={styles.kvLabel}>Cotisation</div>
                <div className={styles.kvValue}>{fnum(terms.finance.contribution)} {cur(terms.finance.currency)} · {terms.finance.frequencyLabel.toLowerCase()}</div>
              </div>
              <div className={styles.kvItem}>
                <div className={styles.kvLabel}>Membres</div>
                <div className={styles.kvValue}>{terms.finance.memberCount}</div>
              </div>
              <div className={styles.kvItem}>
                <div className={styles.kvLabel}>{terms.tontine.distribution === 'growth' || terms.tontine.distribution === 'solo' ? 'Objectif d’épargne' : 'Cagnotte par tour'}</div>
                <div className={styles.kvValue}>
                  {terms.tontine.distribution === 'solo'
                    ? fnum(terms.finance.engagementTotal)
                    : fnum(terms.finance.potPerRound)} {cur(terms.finance.currency)}
                </div>
              </div>
              <div className={styles.kvItem}>
                <div className={styles.kvLabel}>Engagement total</div>
                <div className={styles.kvValue}>{fnum(terms.finance.engagementTotal)} {cur(terms.finance.currency)}</div>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Calendrier ({terms.finance.totalRounds} tour{terms.finance.totalRounds > 1 ? 's' : ''})</h2>
            {terms.calendar.rounds.map((r) => (
              <div key={r.round} className={styles.calRow}>
                <span className={styles.calRound}>Tour {r.round}</span>
                <span className={styles.calDate}>{fdate(r.dueDate)}</span>
                <span className={styles.calWho}>{r.beneficiary ?? '—'}</span>
              </div>
            ))}
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Règles</h2>
            <ul className={styles.rules}>
              {[
                ['Cotisation', terms.rules.cotisation],
                ['Retard', terms.rules.retard],
                ['Distribution', terms.rules.distribution],
                ['Sortie', terms.rules.sortie],
                ['Gouvernance', terms.rules.gouvernance],
              ].map(([name, text]) => (
                <li key={name} className={styles.ruleItem}>
                  <div className={styles.ruleName}>{name}</div>
                  <div className={styles.ruleText}>{text}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Acceptation des membres</h2>
            {agreement?.acceptances.map((a) => (
              <div key={a.userId} className={styles.accRow}>
                <span className={styles.pos}>{a.position ?? '—'}</span>
                <span className={styles.memberName}>{a.name}{a.userId === meId ? ' (vous)' : ''}</span>
                {a.acceptedAt
                  ? <span className={styles.ok}>✓ {fdate(a.acceptedAt)}</span>
                  : <span className={styles.pending}>En attente</span>}
              </div>
            ))}
          </div>

          {agreement && agreement.events.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Journal de la tontine</h2>
              <div className={styles.timeline}>
                {agreement.events.map((e) => (
                  <div key={e.id} className={styles.evt}>
                    <div className={styles.evtLabel}>
                      {e.label}
                      {e.round ? ` · tour ${e.round}` : ''}
                      {e.amount ? ` · ${fnum(e.amount)} ${cur(terms.finance.currency)}` : ''}
                    </div>
                    <div className={styles.evtMeta}>
                      {new Date(e.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {needsExplicitAccept && (
            <div className={styles.acceptBox}>
              <p className={styles.acceptText}>
                Le contrat a été figé au démarrage de la tontine. En confirmant, vous reconnaissez
                avoir lu et accepté l&apos;ensemble des règles ci-dessus.
              </p>
              <button className="btn btn-primary btn-full" disabled={busy} onClick={onAccept}>
                {busy ? '…' : 'J’ai lu et j’accepte le contrat'}
              </button>
            </div>
          )}

          <p className={styles.disclaimer}>
            Ce contrat numérique décrit les engagements internes au groupe. Il n&apos;utilise pas de
            blockchain. Chaque événement est horodaté et conservé dans le journal ci-dessus.
          </p>
        </>
      )}
    </div>
  );
}

function cur(c: string): string {
  return c === 'XOF' || c === 'XAF' ? 'FCFA' : c;
}
