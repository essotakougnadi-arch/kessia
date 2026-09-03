'use client';
// ============================================================
// KESSIA — Register Form (Client Component)
// Inscription multi-étapes : Compte → OTP → Profil → KYC
// ============================================================

import { useState, FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './auth.module.css';
import { KessiaLogo } from '@/components/design-system/ui/KessiaLogo';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { CountryPhoneField, PhoneValue } from '@/components/auth/CountryPhoneField';
import { useAuth } from '@/hooks/useAuth';
import { useT } from '@/lib/i18n';
import { toE164, readStoredCountryIso } from '@/lib/constants/countries';
import { LEGAL_VERSION, LEGAL_VERSION_LABEL } from '@/lib/legal/versions';

const PROFILE_TYPES = [
  { id: 'INDIVIDUAL', icon: '👤' },
  { id: 'BEGINNER_ENTREPRENEUR', icon: '🚀' },
  { id: 'MICRO_ENTERPRISE', icon: '🏪' },
  { id: 'SME', icon: '🏢' },
  { id: 'COOPERATIVE', icon: '🤝' },
] as const;

const STEP_KEYS = ['account', 'verification', 'profile', 'kyc'] as const;

type PasswordStrength = 'none' | 'weak' | 'fair' | 'strong' | 'very-strong';

function getPasswordStrength(pwd: string): PasswordStrength {
  if (!pwd) return 'none';
  const score =
    (pwd.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(pwd) ? 1 : 0) +
    (/[0-9]/.test(pwd) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pwd) ? 1 : 0);
  if (score <= 1) return 'weak';
  if (score === 2) return 'fair';
  if (score === 3) return 'strong';
  return 'very-strong';
}

const STRENGTH_KEY: Record<PasswordStrength, string> = {
  none: '',
  weak: 'strengthWeak',
  fair: 'strengthFair',
  strong: 'strengthStrong',
  'very-strong': 'strengthVeryStrong',
};

/** Rend un libellé contenant `{link}` avec un lien React inséré à la place. */
function withLink(text: string, link: ReactNode): ReactNode {
  const [before, after = ''] = text.split('{link}');
  return <>{before}{link}{after}</>;
}

export default function RegisterPage() {
  const router = useRouter();
  const t = useT();
  const { register, loading, error } = useAuth();

  const [profileType, setProfileType] = useState<string>('INDIVIDUAL');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState<PhoneValue>(() => ({ iso: readStoredCountryIso(), national: '' }));
  const [formError, setFormError] = useState<string | null>(null);

  const strength = getPasswordStrength(password);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const form = e.currentTarget;
    const data = new FormData(form);

    const firstName = (data.get('firstName') as string).trim();
    const lastName = (data.get('lastName') as string).trim();
    const fullPhone = toE164(phone.iso, phone.national);
    const email = (data.get('email') as string).trim() || undefined;
    const pwd = data.get('password') as string;
    const acceptTerms = data.get('acceptTerms') === 'on';
    const acceptData = data.get('acceptData') === 'on';

    if (fullPhone.replace(/\D/g, '').length < 8) {
      setFormError(t('auth.register.phoneError'));
      return;
    }
    if (!acceptTerms || !acceptData) {
      setFormError(t('auth.register.consentError'));
      return;
    }
    if (pwd.length < 8) {
      setFormError(t('auth.register.passwordError'));
      return;
    }

    const result = await register({
      phone: fullPhone,
      country: phone.iso,
      firstName,
      lastName,
      password: pwd,
      email,
      userType: profileType,
      consentTerms: acceptTerms,
      consentData: acceptData,
      termsVersion: LEGAL_VERSION,
    });
    if (result) {
      // Stocker le numéro en session pour la page OTP
      sessionStorage.setItem('kessia-otp-phone', fullPhone);
      sessionStorage.setItem('kessia-otp-purpose', 'REGISTER');
      router.push('/verify-otp');
    }
  }

  return (
    <div className={styles.page}>

      {/* ═══ LEFT PANEL — Brand ═══ */}
      <div className={styles.leftPanel}>
        <div className={styles.leftContent}>
          <Link href="/" className={styles.logoLink} aria-label="KESSIA">
            <KessiaLogo variant="white" size={36} />
          </Link>

          <div className={styles.leftBody}>
            <div className={styles.slideshow}>
              <div className={`${styles.slide} ${styles.slideActive}`}>
                <div className={styles.slideIcon}>🔄</div>
                <h3 className={styles.slideTitle}>{t('auth.register.slideTitle')}</h3>
                <p className={styles.slideDesc}>
                  {t('auth.register.slideDesc')}
                </p>
              </div>
            </div>
            <div className={styles.dots}>
              <div className={`${styles.dot} ${styles.dotActive}`} />
              <div className={styles.dot} />
              <div className={styles.dot} />
              <div className={styles.dot} />
            </div>
          </div>

          <div className={styles.aiPrompt}>
            <div className={styles.aiPromptIcon}>✨</div>
            <div>
              <div className={styles.aiPromptLabel}>KESSIA AI</div>
              <div className={styles.aiPromptMsg}>
                {t('auth.register.aiPrompt')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL — Form ═══ */}
      <div className={styles.rightPanel}>
        <div className={styles.formContainer}>

          {/* Logo mobile + langue */}
          <div className={styles.mobileLogo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <KessiaLogo variant="full" size={28} />
            <LanguageSwitcher />
          </div>

          <div className={styles.formHeader}>
            <h1 className={styles.formTitle}>{t('auth.register.title')}</h1>
            <p className={styles.formSubtitle}>
              {t('auth.register.subtitle')}
            </p>
          </div>

          {/* Step Indicator */}
          <div className={styles.stepIndicator}>
            {STEP_KEYS.map((step, i) => (
              <div key={step} className={styles.stepIndicatorItem}>
                <div className={`${styles.stepItem} ${i === 0 ? styles.stepItemActive : ''}`}>
                  <div className={styles.stepNum}>{i + 1}</div>
                  <span>{t(`auth.register.steps.${step}`)}</span>
                </div>
                {i < 3 && <div className={styles.stepLine} />}
              </div>
            ))}
          </div>

          {/* Profile Type */}
          <div className={styles.profileTypes}>
            <div className={styles.profileTypesLabel}>{t('auth.register.chooseProfile')}</div>
            {PROFILE_TYPES.map((type) => (
              <label
                key={type.id}
                className={`${styles.profileTypeOption} ${profileType === type.id ? styles.profileTypeSelected : ''}`}
                htmlFor={`profile-${type.id}`}
              >
                <input
                  type="radio"
                  id={`profile-${type.id}`}
                  name="profileType"
                  value={type.id}
                  checked={profileType === type.id}
                  onChange={() => setProfileType(type.id)}
                  className={styles.profileTypeRadio}
                />
                <span className={styles.profileTypeIcon}>{type.icon}</span>
                <div>
                  <div className={styles.profileTypeLabel}>{t(`auth.register.profiles.${type.id}.label`)}</div>
                  <div className={styles.profileTypeSub}>{t(`auth.register.profiles.${type.id}.sub`)}</div>
                </div>
                <span className={styles.profileTypeCheck}>✓</span>
              </label>
            ))}
          </div>

          {/* Form */}
          <form className={styles.form} id="register-form" onSubmit={handleSubmit}>
            <div className={styles.formRow}>
              <div className="form-group">
                <label className="label" htmlFor="firstName">{t('auth.register.firstName')}</label>
                <input id="firstName" name="firstName" type="text" className="input"
                  placeholder={t('auth.register.firstNamePlaceholder')} required autoComplete="given-name" />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="lastName">{t('auth.register.lastName')}</label>
                <input id="lastName" name="lastName" type="text" className="input"
                  placeholder={t('auth.register.lastNamePlaceholder')} required autoComplete="family-name" />
              </div>
            </div>

            <CountryPhoneField
              id="phone"
              label={t('auth.register.phone')}
              countryAriaLabel={t('auth.register.countryLabel')}
              value={phone}
              onChange={setPhone}
              required
            />

            <div className="form-group">
              <label className="label" htmlFor="email">
                {t('auth.register.email')}
                <span className="label-hint">{t('auth.register.emailOptional')}</span>
              </label>
              <input id="email" name="email" type="email" className="input"
                placeholder={t('auth.register.emailPlaceholder')} autoComplete="email" />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="password">{t('auth.register.password')}</label>
              <input id="password" name="password" type="password" className="input"
                placeholder={t('auth.register.passwordPlaceholder')} required autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {password && (
                <div className={styles.passwordStrength}>
                  <div className={styles.passwordBars}>
                    {(['weak', 'fair', 'strong', 'very-strong'] as const).map((level, i) => {
                      const strengthIndex = ['weak', 'fair', 'strong', 'very-strong'].indexOf(strength);
                      const isActive = i <= strengthIndex && strength !== 'none';
                      const colors = ['#EF4444', '#F59E0B', '#10B981', '#059669'];
                      return (
                        <div
                          key={level}
                          className={styles.passwordBar}
                          style={{ background: isActive ? colors[i] : undefined }}
                        />
                      );
                    })}
                  </div>
                  {strength !== 'none' && (
                    <span className={styles.passwordStrengthLabel}>{t(`auth.register.${STRENGTH_KEY[strength]}`)}</span>
                  )}
                </div>
              )}
            </div>

            <div className={styles.consents}>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" id="acceptTerms" name="acceptTerms" required />
                <span className={styles.checkmark} />
                <span>
                  {withLink(
                    t('auth.register.acceptTerms'),
                    <a href="/legal/terms" className="text-primary">{t('auth.register.acceptTermsLink')}</a>
                  )}
                </span>
              </label>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" id="acceptData" name="acceptData" required />
                <span className={styles.checkmark} />
                <span>
                  {withLink(
                    t('auth.register.acceptData'),
                    <a href="/legal/privacy" className="text-primary">{t('auth.register.acceptDataLink')}</a>
                  )}
                </span>
              </label>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '2px 0 0' }}>
                {withLink(
                  t('auth.register.legalVersion', { label: LEGAL_VERSION_LABEL }),
                  <a href="/legal/mentions" className="text-primary">{t('auth.register.legalVersionLink')}</a>
                )}
              </p>
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
              id="btn-register"
              disabled={loading}
            >
              {loading ? t('auth.register.submitting') : t('auth.register.submit')}
            </button>
          </form>

          <p className={styles.loginLink}>
            {t('auth.register.haveAccount')}{' '}
            <Link href="/login" className="text-primary font-semibold">
              {t('auth.register.signIn')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
