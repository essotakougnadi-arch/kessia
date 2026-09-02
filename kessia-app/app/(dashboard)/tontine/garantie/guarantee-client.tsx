'use client';
// ============================================================
// KESSIA — Fonds de Garantie Solidaire · vue membre (§6.5)
// ⚠️ MODE DÉMONSTRATION — aucun mouvement de fonds réel.
// ============================================================

import { useMemo, useState, FormEvent } from 'react';
import Link from 'next/link';
import styles from './guarantee.module.css';
import { useGuarantee } from '@/hooks/useGuarantee';
import { useTontines } from '@/hooks/useTontines';
import { useUiStore } from '@/store/uiStore';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { Modal } from '@/components/ui/Modal';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En examen', APPROVED: 'Approuvée', SETTLED: 'Approuvée', REJECTED: 'Refusée', CANCELLED: 'Annulée',
};

function fnum(v: number) { return v.toLocaleString('fr-FR'); }

export default function GuaranteeClient() {
  const { data, isLoading, error, refresh, requestHelp } = useGuarantee();
  const { tontines } = useTontines();
  const addToast = useUiStore((s) => s.addToast);

  const [open, setOpen] = useState(false);
  const [tontineId, setTontineId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const activeTontines = useMemo(
    () => tontines.filter((t) => t.status === 'ACTIVE' && t.myMembership?.status === 'ACTIVE'),
    [tontines]
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormErr(null);
    const t = activeTontines.find((x) => x.id === tontineId);
    if (!t) return setFormErr('Choisissez une tontine.');
    if (reason.trim().length < 10) return setFormErr('Expliquez brièvement votre situation.');
    setBusy(true);
    const r = await requestHelp({ tontineId: t.id, round: t.currentRound, reason: reason.trim() });
    setBusy(false);
    if (r.success) {
      addToast({ type: 'success', message: r.message });
      setOpen(false); setReason(''); setTontineId('');
    } else setFormErr(r.message);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/tontine" className={styles.back} aria-label="Retour">←</Link>
        <h1 className={styles.title}>Fonds de Garantie Solidaire</h1>
      </header>

      <div className={styles.demoBanner}>
        <strong>Mode démonstration.</strong> Le Fonds de Garantie Solidaire est en cours de mise en place
        et n&apos;est pas encore actif. Aucun mouvement de fonds réel n&apos;est effectué ; les montants ci-dessous
        sont des projections. Son activation est soumise à une validation juridique.
      </div>

      {error && !isLoading && <ErrorNote message="Impossible de charger le fonds." onRetry={refresh} />}

      {data && (
        <>
          <div className={styles.hero}>
            <div className={styles.heroLabel}>Solde projeté du fonds</div>
            <div className={styles.heroAmount}>{fnum(data.fund.projectedBalance)} <span style={{ fontSize: 16 }}>{data.fund.currency === 'XOF' ? 'FCFA' : data.fund.currency}</span></div>
            <div className={styles.heroSub}>
              {data.fund.allocationRatePct}% des cotisations de tontine, projeté sur l&apos;activité réelle
            </div>
            <div className={styles.heroGrid}>
              <div className={styles.heroStat}>
                <div className={styles.heroStatVal}>{fnum(data.fund.projectedContributions)}</div>
                <div className={styles.heroStatLab}>Collecté (projeté)</div>
              </div>
              <div className={styles.heroStat}>
                <div className={styles.heroStatVal}>{fnum(data.fund.claimsSettledTotal)}</div>
                <div className={styles.heroStatLab}>Demandes réglées</div>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>À quoi ça sert ?</h2>
            <p className={styles.p}>
              Le Fonds de Garantie Solidaire est un filet de sécurité mutualisé. Lorsqu&apos;un membre
              en difficulté ponctuelle ne peut pas honorer une cotisation, il peut demander l&apos;aide
              du fonds. La demande est examinée par l&apos;équipe conformité de KESSIA. Si elle est
              approuvée, le fonds couvrirait la cotisation pour ne pas bloquer le groupe.
            </p>
            <h2 className={styles.sectionTitle} style={{ marginTop: 14 }}>Conditions</h2>
            <ul className={styles.rules}>
              <li>Identité vérifiée (KYC)</li>
              <li>Au moins {data.rules.minOnTimeContributions} cotisations réglées</li>
              <li>Compte de plus de {data.rules.minMembershipDays} jours</li>
              <li>Au maximum {data.rules.maxApprovedClaimsPerYear} demandes approuvées sur 12 mois</li>
              <li>Décision prise par un agent conformité — jamais automatique</li>
            </ul>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Votre éligibilité</h2>
            {data.eligibility.eligible ? (
              <div className={`${styles.eligBox} ${styles.eligOk}`}>✓ Vous remplissez les conditions pour solliciter le fonds.</div>
            ) : (
              <div className={`${styles.eligBox} ${styles.eligNo}`}>
                Vous ne remplissez pas encore toutes les conditions :
                <ul>{data.eligibility.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}
            {data.requestsEnabled ? (
              <button
                className="btn btn-primary btn-full"
                style={{ marginTop: 12 }}
                disabled={!data.eligibility.eligible || activeTontines.length === 0}
                onClick={() => setOpen(true)}
              >
                Demander l’aide du fonds
              </button>
            ) : (
              <p className={styles.p} style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
                Les demandes ne sont pas encore ouvertes dans cette version.
              </p>
            )}
          </div>

          {data.claims.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Vos demandes</h2>
              {data.claims.map((c) => (
                <div key={c.id} className={styles.claim}>
                  <div className={styles.claimTop}>
                    <span className={styles.claimAmount}>{fnum(c.amount)} {data.fund.currency === 'XOF' ? 'FCFA' : data.fund.currency}</span>
                    <span className={`${styles.st} ${styles['st' + c.status as keyof typeof styles] ?? ''}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                  </div>
                  <div className={styles.claimReason}>{c.reason}</div>
                  {c.decisionNote && <div className={styles.claimNote}>Réponse : {c.decisionNote}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Demander l’aide du fonds">
        <form className={styles.form} onSubmit={submit}>
          <p className={styles.p} style={{ fontSize: 12.5 }}>
            Mode démonstration : votre demande sera enregistrée et examinée, mais aucun montant ne sera
            réellement débité ou crédité.
          </p>
          <div className="form-group">
            <label className="label" htmlFor="g-tontine">Tontine concernée</label>
            <select id="g-tontine" className="input" value={tontineId} onChange={(e) => setTontineId(e.target.value)}>
              <option value="">Choisir…</option>
              {activeTontines.map((t) => (
                <option key={t.id} value={t.id}>{t.name} — tour {t.currentRound}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label" htmlFor="g-reason">Votre situation</label>
            <textarea id="g-reason" className="input" rows={3} maxLength={500}
              placeholder="Ex. Retard de paiement d’un client, dépense de santé imprévue…"
              value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {formErr && <div className={styles.err}>⚠️ {formErr}</div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
            {busy ? '…' : 'Envoyer ma demande'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
