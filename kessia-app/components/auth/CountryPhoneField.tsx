'use client';
// ============================================================
// KESSIA — Champ « numéro de téléphone » avec choix du pays
// Composant contrôlé : le parent détient { iso, national }.
// Émet deux champs cachés pour la soumission classique du form :
//   name (défaut « phone »)        → numéro E.164 « +22890123456 »
//   countryFieldName (« country ») → code ISO du pays « TG »
// ============================================================

import { ChangeEvent } from 'react';
import {
  COUNTRIES,
  findCountry,
  toE164,
  isNationalLengthPlausible,
  storeCountryIso,
} from '@/lib/constants/countries';
import styles from './CountryPhoneField.module.css';

export interface PhoneValue {
  iso: string;
  national: string;
}

interface Props {
  id: string;
  label: string;
  countryAriaLabel: string;
  value: PhoneValue;
  onChange: (next: PhoneValue) => void;
  name?: string;
  countryFieldName?: string;
  autoFocus?: boolean;
  required?: boolean;
}

export function CountryPhoneField({
  id,
  label,
  countryAriaLabel,
  value,
  onChange,
  name = 'phone',
  countryFieldName = 'country',
  autoFocus,
  required,
}: Props) {
  const country = findCountry(value.iso);
  const e164 = toE164(value.iso, value.national);
  const invalid =
    value.national.trim().length > 0 && !isNationalLengthPlausible(value.iso, value.national);

  function handleCountry(e: ChangeEvent<HTMLSelectElement>) {
    const iso = e.target.value;
    storeCountryIso(iso);
    onChange({ iso, national: value.national });
  }

  function handleNational(e: ChangeEvent<HTMLInputElement>) {
    // chiffres + espaces uniquement, on garde le formatage libre de l'utilisateur
    const cleaned = e.target.value.replace(/[^\d\s]/g, '');
    onChange({ iso: value.iso, national: cleaned });
  }

  return (
    <div className="form-group">
      <label className="label" htmlFor={id}>
        {label}
        <span className="label-hint">
          {country.flag} {country.name} · +{country.dial}
        </span>
      </label>

      <div className={styles.wrap} data-invalid={invalid || undefined}>
        <select
          className={styles.country}
          aria-label={countryAriaLabel}
          value={value.iso}
          onChange={handleCountry}
        >
          {COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.flag} +{c.dial}
            </option>
          ))}
        </select>

        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          className={`input ${styles.field}`}
          placeholder={country.example}
          value={value.national}
          onChange={handleNational}
          autoFocus={autoFocus}
          required={required}
        />
      </div>

      <input type="hidden" name={name} value={e164} />
      <input type="hidden" name={countryFieldName} value={value.iso} />
    </div>
  );
}

export default CountryPhoneField;
