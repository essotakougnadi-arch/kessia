'use client';
// ============================================================
// KESSIA — Sécurité & Mot de passe (§31)
// ============================================================

import { useEffect, useRef, useState, FormEvent } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import styles from './security.module.css';
import { useUiStore } from '@/store/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { useSecurity } from '@/hooks/useSecurity';
import { formatRelativeDate } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';

export default function SecurityClient() {
  const t = useT();
  const addToast = useUiStore((s) => s.addToast);
  const { logout } = useAuth();
  const s = useSecurity();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/profile" className={styles.back} aria-label={t('securityPage.back')}>←</Link>
        <h1 className={styles.title}>{t('securityPage.title')}</h1>
      </header>

      <PasswordSection
        onChange={s.changePassword}
        onDone={(m) => { addToast({ type: 'success', message: m }); setTimeout(() => logout(), 1500); }}
      />

      <TwoFactorSection sec={s} addToast={addToast} />

      <SessionsSection sec={s} addToast={addToast} />
    </div>
  );
}

// ── Mot de passe ────────────────────────────────────────────

function PasswordSection({
  onChange, onDone,
}: {
  onChange: (cur: string, next: string) => Promise<{ success: boolean; message: string }>;
  onDone: (m: string) => void;
}) {
  const t = useT();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (next !== next2) return setErr(t('securityPage.passwordMismatch'));
    setLoading(true);
    const r = await onChange(cur, next);
    setLoading(false);
    if (r.success) onDone(r.message);
    else setErr(r.message);
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('securityPage.passwordTitle')}</h2>
      <p className={styles.sectionDesc}>{t('securityPage.passwordDesc')}</p>
      <form className={styles.form} onSubmit={submit}>
        <input className="input" type="password" placeholder={t('securityPage.currentPassword')} value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        <input className="input" type="password" placeholder={t('securityPage.newPassword')} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <input className="input" type="password" placeholder={t('securityPage.confirmPassword')} value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
        {err && <div className={styles.err}>⚠️ {err}</div>}
        <button className="btn btn-primary btn-full" disabled={loading || !cur || next.length < 8}>
          {loading ? '…' : t('securityPage.changePassword')}
        </button>
      </form>
    </section>
  );
}

// ── 2FA ─────────────────────────────────────────────────────

function TwoFactorSection({ sec, addToast }: { sec: ReturnType<typeof useSecurity>; addToast: (t: { type: 'success' | 'error' | 'info'; message: string }) => void }) {
  const t = useT();
  const [phase, setPhase] = useState<'idle' | 'setup' | 'backup' | 'disable'>('idle');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (phase === 'setup' && otpauthUri && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, otpauthUri, { width: 190, margin: 1 }).catch(() => {});
    }
  }, [phase, otpauthUri]);

  async function begin() {
    setErr(null); setBusy(true);
    const r = await sec.start2fa();
    setBusy(false);
    if (r.success && r.data) {
      const d = r.data as { secret: string; otpauthUri: string };
      setSecret(d.secret); setOtpauthUri(d.otpauthUri); setPhase('setup');
    } else setErr(r.message);
  }

  async function confirm() {
    setErr(null); setBusy(true);
    const r = await sec.enable2fa(code.trim());
    setBusy(false);
    if (r.success && r.data) {
      setBackup((r.data as { backupCodes: string[] }).backupCodes);
      setPhase('backup'); setCode('');
    } else setErr(r.message);
  }

  async function turnOff() {
    setErr(null); setBusy(true);
    const r = await sec.disable2fa(code.trim());
    setBusy(false);
    if (r.success) { addToast({ type: 'success', message: r.message }); setPhase('idle'); setCode(''); }
    else setErr(r.message);
  }

  return (
    <section className={styles.section}>
      <div className={styles.row}>
        <div>
          <h2 className={styles.sectionTitle}>{t('securityPage.twoFactorTitle')}</h2>
          <p className={styles.sectionDesc}>{t('securityPage.twoFactorDesc')}</p>
        </div>
        <span className={sec.twoFactorEnabled ? styles.statusOn : styles.statusOff}>
          {sec.twoFactorEnabled ? t('securityPage.twoFactorOn') : t('securityPage.twoFactorOff')}
        </span>
      </div>

      {phase === 'idle' && !sec.twoFactorEnabled && (
        <button className="btn btn-primary btn-full" style={{ marginTop: 12 }} onClick={begin} disabled={busy}>
          {busy ? t('securityPage.busy') : t('securityPage.enable2fa')}
        </button>
      )}

      {phase === 'idle' && sec.twoFactorEnabled && (
        <>
          <p className={styles.sectionDesc}>{t('securityPage.backupRemaining', { count: sec.backupCodesRemaining })}</p>
          <button className="btn btn-danger btn-full" style={{ marginTop: 8 }} onClick={() => setPhase('disable')}>
            {t('securityPage.disable2fa')}
          </button>
        </>
      )}

      {phase === 'setup' && (
        <div className={styles.form}>
          <p className={styles.sectionDesc}>{t('securityPage.setupStep1')}</p>
          <div className={styles.qrBox}><canvas ref={canvasRef} /></div>
          <div className={styles.secret}>{t('securityPage.manualKey', { secret })}</div>
          <p className={styles.sectionDesc}>{t('securityPage.setupStep2')}</p>
          <input className="input" inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} style={{ textAlign: 'center', letterSpacing: 3 }} />
          {err && <div className={styles.err}>⚠️ {err}</div>}
          <button className="btn btn-primary btn-full" onClick={confirm} disabled={busy || code.trim().length < 6}>
            {busy ? t('securityPage.busy') : t('securityPage.confirmActivate')}
          </button>
          <button className="btn btn-ghost btn-full" onClick={() => setPhase('idle')}>{t('securityPage.cancel')}</button>
        </div>
      )}

      {phase === 'backup' && (
        <div className={styles.form}>
          <p className={styles.sectionDesc}>{t('securityPage.backupTitle')}</p>
          <div className={styles.backupGrid}>
            {backup.map((c) => <div key={c} className={styles.backupCode}>{c}</div>)}
          </div>
          <button className="btn btn-primary btn-full" onClick={() => setPhase('idle')}>{t('securityPage.backupDone')}</button>
        </div>
      )}

      {phase === 'disable' && (
        <div className={styles.form}>
          <p className={styles.sectionDesc}>{t('securityPage.disableConfirm')}</p>
          <input className="input" inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} style={{ textAlign: 'center', letterSpacing: 3 }} />
          {err && <div className={styles.err}>⚠️ {err}</div>}
          <button className="btn btn-danger btn-full" onClick={turnOff} disabled={busy || code.trim().length < 6}>
            {busy ? t('securityPage.busy') : t('securityPage.disable')}
          </button>
          <button className="btn btn-ghost btn-full" onClick={() => setPhase('idle')}>{t('securityPage.cancel')}</button>
        </div>
      )}
    </section>
  );
}

// ── Sessions ────────────────────────────────────────────────

function SessionsSection({ sec, addToast }: { sec: ReturnType<typeof useSecurity>; addToast: (t: { type: 'success' | 'error' | 'info'; message: string }) => void }) {
  const t = useT();
  return (
    <section className={styles.section}>
      <div className={styles.row}>
        <div>
          <h2 className={styles.sectionTitle}>{t('securityPage.sessionsTitle')}</h2>
          <p className={styles.sectionDesc}>{t('securityPage.sessionsDesc')}</p>
        </div>
        {sec.sessions.length > 1 && (
          <button className={styles.revoke} onClick={async () => { const r = await sec.revokeOthers(); addToast({ type: r.success ? 'success' : 'error', message: r.message }); }}>
            {t('securityPage.disconnectOthers')}
          </button>
        )}
      </div>
      {sec.sessions.length === 0 && <p className={styles.sectionDesc}>{t('securityPage.noSessions')}</p>}
      {sec.sessions.map((sess) => (
        <div key={sess.id} className={styles.sessionRow}>
          <div>
            <div className={styles.sessionDevice}>{shorten(sess.device)}</div>
            <div className={styles.sessionMeta}>
              {sess.ipAddress ?? t('securityPage.unknownIp')} · {t('securityPage.seenAt', { date: formatRelativeDate(sess.lastUsedAt) })}
            </div>
          </div>
          {sess.current
            ? <span className={styles.current}>{t('securityPage.thisDevice')}</span>
            : <button className={styles.revoke} onClick={async () => { const r = await sec.revokeSession(sess.id); addToast({ type: r.success ? 'success' : 'error', message: r.message }); }}>{t('securityPage.disconnect')}</button>}
        </div>
      ))}
    </section>
  );
}

function shorten(ua: string) {
  if (/iphone|ipad/i.test(ua)) return 'iOS · Safari';
  if (/android/i.test(ua)) return 'Android';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return ua.slice(0, 40);
}
