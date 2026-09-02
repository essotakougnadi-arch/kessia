'use client';
// ============================================================
// KESSIA — Login Form (Client Component)
// Connexion par mot de passe ou OTP SMS
// ============================================================

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../register/auth.module.css';
import { KessiaLogo } from '@/components/design-system/ui/KessiaLogo';
import { useAuth } from '@/hooks/useAuth';
import { useT } from '@/lib/i18n';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

type LoginMode = 'password' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const { loginWithPassword, verifyOtp, verify2fa, requestOtp, loading, error, pending2fa } = useAuth();

  const [mode, setMode] = useState<LoginMode>('password');
  const [formError, setFormError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [code2fa, setCode2fa] = useState('');

  async function handlePasswordLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const form = e.currentTarget;
    const data = new FormData(form);
    const phoneRaw = (data.get('phone') as string).replace(/\s/g, '');
    const phone = `+228${phoneRaw}`;
    const password = data.get('password') as string;

    await loginWithPassword({ phone, password });
  }

  async function handle2fa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    await verify2fa(code2fa.trim());
  }

  async function handleOtpRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const form = e.currentTarget;
    const data = new FormData(form);
    const phoneRaw = (data.get('phone') as string).replace(/\s/g, '');
    const phone = `+228${phoneRaw}`;

    const ok = await requestOtp(phone, 'LOGIN');
    if (ok) {
      sessionStorage.setItem('kessia-otp-phone', phone);
      sessionStorage.setItem('kessia-otp-purpose', 'LOGIN');
      setOtpSent(true);
      setTimeout(() => router.push('/verify-otp'), 800);
    }
  }

  return (
    <div className={styles.page}>

      {/* ═══ LEFT PANEL ═══ */}
      <div className={styles.leftPanel}>
        <div className={styles.leftContent}>
          <Link href="/" className={styles.logoLink} aria-label="KESSIA">
            <KessiaLogo variant="white" size={36} />
          </Link>

          <div className={styles.leftBody}>
            <div className={styles.slideshow}>
              <div className={`${styles.slide} ${styles.slideActive}`}>
                <div className={styles.slideIcon}>👋</div>
                <h3 className={styles.slideTitle}>{t('auth.login.welcomeBack')}</h3>
                <p className={styles.slideDesc}>
                  {t('auth.login.welcomeBackDesc')}
                </p>
              </div>
            </div>
          </div>

          <div className={styles.aiPrompt}>
            <div className={styles.aiPromptIcon}>✨</div>
            <div>
              <div className={styles.aiPromptLabel}>KESSIA AI</div>
              <div className={styles.aiPromptMsg}>
                {t('auth.login.aiHelp')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div className={styles.rightPanel}>
        <div className={styles.formContainer}>

          {/* Logo mobile + langue */}
          <div className={styles.mobileLogo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <KessiaLogo variant="full" size={28} />
            <LanguageSwitcher />
          </div>

          <div className={styles.formHeader}>
            <h1 className={styles.formTitle}>{pending2fa ? t('auth.login.twoFaTitle') : t('auth.login.title')}</h1>
            <p className={styles.formSubtitle}>
              {pending2fa ? t('auth.login.twoFaSubtitle') : t('auth.login.subtitle')}
            </p>
          </div>

          {pending2fa && (
            <form className={styles.form} onSubmit={handle2fa}>
              <div className="form-group">
                <label className="label" htmlFor="code-2fa">{t('auth.login.codeLabel')}</label>
                <input
                  id="code-2fa"
                  className="input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code2fa}
                  onChange={(e) => setCode2fa(e.target.value)}
                  autoFocus
                />
              </div>
              {(error || formError) && (
                <div className={styles.errorMessage}>⚠️ {formError ?? error}</div>
              )}
              <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading || code2fa.trim().length < 4}>
                {loading ? t('auth.login.validating') : t('auth.login.validate')}
              </button>
            </form>
          )}

          {/* Mode selector */}
          {!pending2fa && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => setMode('password')}
              className={`btn btn-sm ${mode === 'password' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1 }}
            >
              {t('auth.login.modePassword')}
            </button>
            <button
              type="button"
              onClick={() => setMode('otp')}
              className={`btn btn-sm ${mode === 'otp' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1 }}
            >
              {t('auth.login.modeOtp')}
            </button>
          </div>
          )}

          {/* ─── Formulaire Mot de passe ─── */}
          {!pending2fa && mode === 'password' && (
            <form className={styles.form} id="login-form" onSubmit={handlePasswordLogin}>
              <div className="form-group">
                <label className="label" htmlFor="phone-login">
                  {t('auth.login.phone')}
                  <span className="label-hint">{t('auth.login.phoneHint')}</span>
                </label>
                <div className={styles.phoneInput}>
                  <div className={styles.phonePrefix}>🇹🇬 +228</div>
                  <input
                    id="phone-login"
                    name="phone"
                    type="tel"
                    className={`input ${styles.phoneField}`}
                    placeholder={t('auth.login.phonePlaceholder')}
                    required
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="label" htmlFor="password-login">
                  {t('auth.login.password')}
                </label>
                <input
                  id="password-login"
                  name="password"
                  type="password"
                  className="input"
                  placeholder={t('auth.login.passwordPlaceholder')}
                  required
                  autoComplete="current-password"
                />
                <div className={styles.forgotPwd}>
                  <a href="#" className="text-primary" style={{ fontSize: 13, fontWeight: 600 }}>
                    {t('auth.login.forgot')}
                  </a>
                </div>
              </div>

              {(error || formError) && (
                <div className={styles.errorMessage}>
                  ⚠️ {formError ?? error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-full"
                id="btn-login"
                disabled={loading}
              >
                {loading ? t('auth.login.submitting') : t('auth.login.submit')}
              </button>
            </form>
          )}

          {/* ─── Formulaire OTP ─── */}
          {!pending2fa && mode === 'otp' && (
            <form className={styles.form} id="otp-request-form" onSubmit={handleOtpRequest}>
              <div className="form-group">
                <label className="label" htmlFor="phone-otp">
                  {t('auth.login.phone')}
                  <span className="label-hint">{t('auth.login.phoneHint')}</span>
                </label>
                <div className={styles.phoneInput}>
                  <div className={styles.phonePrefix}>🇹🇬 +228</div>
                  <input
                    id="phone-otp"
                    name="phone"
                    type="tel"
                    className={`input ${styles.phoneField}`}
                    placeholder={t('auth.login.phonePlaceholder')}
                    required
                    autoComplete="tel"
                  />
                </div>
              </div>

              {error && (
                <div className={styles.errorMessage}>⚠️ {error}</div>
              )}

              {otpSent && (
                <div style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 13,
                  color: '#10B981',
                  marginBottom: 4,
                }}>
                  {t('auth.login.otpSent')}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-full"
                id="btn-send-otp"
                disabled={loading || otpSent}
              >
                {loading ? t('auth.login.otpSubmitting') : t('auth.login.otpSubmit')}
              </button>
            </form>
          )}

          <p className={styles.loginLink}>
            {t('auth.login.noAccount')}{' '}
            <Link href="/register" className="text-primary font-semibold">
              {t('auth.login.createAccount')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
