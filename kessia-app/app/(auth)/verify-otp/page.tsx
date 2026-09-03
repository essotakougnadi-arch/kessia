'use client';
// ============================================================
// KESSIA — Verify OTP Page (Client Component)
// Saisie du code SMS 6 chiffres
// ============================================================

import { useState, useRef, useEffect, FormEvent, KeyboardEvent, ClipboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './verify-otp.module.css';
import { KessiaLogo } from '@/components/design-system/ui/KessiaLogo';
import { useAuth } from '@/hooks/useAuth';
import { useT } from '@/lib/i18n';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

export default function VerifyOtpPage() {
  const router = useRouter();
  const t = useT();
  const { verifyOtp, verify2fa, requestOtp, loading, error, pending2fa } = useAuth();

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState<'REGISTER' | 'LOGIN' | 'VERIFY'>('REGISTER');
  const [resendCooldown, setResendCooldown] = useState(60);
  const [formError, setFormError] = useState<string | null>(null);
  const [code2fa, setCode2fa] = useState('');
  const [demoOtp, setDemoOtp] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Récupérer le téléphone et purpose depuis sessionStorage
  useEffect(() => {
    const storedPhone = sessionStorage.getItem('kessia-otp-phone') ?? '';
    const storedPurpose = (sessionStorage.getItem('kessia-otp-purpose') as 'REGISTER' | 'LOGIN' | 'VERIFY') ?? 'REGISTER';
    setPhone(storedPhone);
    setPurpose(storedPurpose);

    // Mode démonstration : le code est renvoyé par l'API → on le pré-remplit
    const demo = sessionStorage.getItem('kessia-otp-demo');
    if (demo && /^\d{6}$/.test(demo)) {
      setDemoOtp(demo);
      setOtp(demo.split(''));
    }

    if (!storedPhone) {
      router.push('/login');
    }
  }, [router]);

  // Countdown de renvoi
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Gérer la saisie dans un champ
  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setFormError(null);

    // Auto-focus sur le champ suivant
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  // Gérer Backspace
  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  // Coller depuis le presse-papiers
  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(''));
      inputRefs.current[5]?.focus();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const code = otp.join('');
    if (code.length < 6) {
      setFormError(t('auth.verifyOtp.incomplete'));
      return;
    }

    await verifyOtp({ phone, code, purpose });
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    const ok = await requestOtp(phone, purpose);
    if (ok) {
      setResendCooldown(60);
      const demo = sessionStorage.getItem('kessia-otp-demo');
      if (demo && /^\d{6}$/.test(demo)) {
        setDemoOtp(demo);
        setOtp(demo.split(''));
      } else {
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    }
  }

  // Format téléphone pour affichage
  const displayPhone = phone ? phone.replace('+228', '+228 ') : '...';

  return (
    <div className={styles.page}>

      {/* ═══ CARD ═══ */}
      <div className={styles.card}>

        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <LanguageSwitcher />
        </div>

        {/* Logo */}
        <Link href="/" className={styles.logoLink}>
          <KessiaLogo variant="full" size={32} />
        </Link>

        {/* Icône */}
        <div className={styles.iconWrap}>
          <div className={styles.iconBg}>📱</div>
        </div>

        {/* Titre */}
        <h1 className={styles.title}>{t('auth.verifyOtp.title')}</h1>
        <p className={styles.subtitle}>
          {t('auth.verifyOtp.subtitle')}<br />
          <strong>{displayPhone}</strong>
        </p>

        {/* Étape MFA (si activée) */}
        {pending2fa ? (
          <form className={styles.form} onSubmit={(e) => { e.preventDefault(); verify2fa(code2fa.trim()); }}>
            <p className={styles.subtitle} style={{ marginBottom: 12 }}>
              {t('auth.verifyOtp.twoFaSubtitle')}
            </p>
            <input
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code2fa}
              onChange={(e) => setCode2fa(e.target.value)}
              autoFocus
              style={{ textAlign: 'center', letterSpacing: 4, fontSize: 18 }}
            />
            {(error || formError) && <div className={styles.errorMessage}>⚠️ {formError ?? error}</div>}
            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading || code2fa.trim().length < 4}>
              {loading ? t('auth.verifyOtp.validating') : t('auth.verifyOtp.validate')}
            </button>
          </form>
        ) : (
        /* OTP inputs */
        <form className={styles.form} id="verify-otp-form" onSubmit={handleSubmit}>
          {demoOtp && (
            <div className={styles.demoNote} role="status">
              🎭 {t('auth.verifyOtp.demoNote', { code: demoOtp })}
            </div>
          )}
          <div className={styles.otpRow}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                id={`otp-${i}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                className={`${styles.otpInput} ${digit ? styles.otpInputFilled : ''}`}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                autoFocus={i === 0}
                aria-label={`Chiffre ${i + 1}`}
              />
            ))}
          </div>

          {/* Erreurs */}
          {(error || formError) && (
            <div className={styles.errorMessage}>
              ⚠️ {formError ?? error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-full"
            id="btn-verify-otp"
            disabled={loading || otp.join('').length < 6}
          >
            {loading ? t('auth.verifyOtp.confirming') : t('auth.verifyOtp.confirm')}
          </button>
        </form>
        )}

        {/* Renvoi */}
        {!pending2fa && (
        <div className={styles.resendSection}>
          <p className={styles.resendText}>
            {t('auth.verifyOtp.noCode')}
          </p>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0 || loading}
            className={styles.resendBtn}
            id="btn-resend-otp"
          >
            {resendCooldown > 0
              ? t('auth.verifyOtp.resendIn', { s: resendCooldown })
              : t('auth.verifyOtp.resend')}
          </button>
        </div>
        )}

        {/* KESSIA AI hint */}
        <div className={styles.aiHint}>
          <span className={styles.aiHintIcon}>✨</span>
          <p className={styles.aiHintText}>
            {t('auth.verifyOtp.devHint')}
          </p>
        </div>

        {/* Retour */}
        <Link href="/login" className={styles.backLink}>
          {t('auth.verifyOtp.back')}
        </Link>
      </div>
    </div>
  );
}
