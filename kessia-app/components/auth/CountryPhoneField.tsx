'use client';
// ============================================================
// KESSIA — Champ « numéro de téléphone » avec choix du pays
// Composant contrôlé : le parent détient { iso, national }.
// Sélecteur de pays = liste déroulante maison (les <select>
// natifs n'affichent pas les drapeaux emoji sous Windows) avec
// de vrais drapeaux SVG (/public/flags/<iso>.svg).
// Émet deux champs cachés pour la soumission classique du form :
//   name (défaut « phone »)        → numéro E.164 « +22890123456 »
//   countryFieldName (« country ») → code ISO du pays « TG »
// ============================================================

import { ChangeEvent, KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
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

function flagSrc(iso: string) {
  return `/flags/${iso.toLowerCase()}.svg`;
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

  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIso, setActiveIso] = useState(value.iso);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const typeaheadRef = useRef<{ buffer: string; at: number }>({ buffer: '', at: 0 });

  // Fermeture au clic extérieur / Échap
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // À l'ouverture, l'option active = le pays sélectionné ; on la fait défiler dans la vue
  useEffect(() => {
    if (!open) return;
    setActiveIso(value.iso);
    const el = document.getElementById(`${listId}-${value.iso}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, value.iso, listId]);

  function commit(iso: string) {
    storeCountryIso(iso);
    onChange({ iso, national: value.national });
    setOpen(false);
    btnRef.current?.focus();
  }

  function moveActive(delta: number) {
    const idx = COUNTRIES.findIndex((c) => c.iso === activeIso);
    const next = COUNTRIES[Math.min(COUNTRIES.length - 1, Math.max(0, idx + delta))];
    if (next) {
      setActiveIso(next.iso);
      document.getElementById(`${listId}-${next.iso}`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveActive(1); break;
      case 'ArrowUp': e.preventDefault(); moveActive(-1); break;
      case 'Home': e.preventDefault(); setActiveIso(COUNTRIES[0].iso); break;
      case 'End': e.preventDefault(); setActiveIso(COUNTRIES[COUNTRIES.length - 1].iso); break;
      case 'Enter':
      case ' ': e.preventDefault(); commit(activeIso); break;
      case 'Escape': e.preventDefault(); setOpen(false); break;
      case 'Tab': setOpen(false); break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const ta = typeaheadRef.current;
          const now = Date.now();
          ta.buffer = now - ta.at > 700 ? e.key : ta.buffer + e.key;
          ta.at = now;
          const match = COUNTRIES.find((c) =>
            c.name.toLowerCase().startsWith(ta.buffer.toLowerCase())
          );
          if (match) {
            setActiveIso(match.iso);
            document.getElementById(`${listId}-${match.iso}`)?.scrollIntoView({ block: 'nearest' });
          }
        }
    }
  }

  function handleNational(e: ChangeEvent<HTMLInputElement>) {
    const cleaned = e.target.value.replace(/[^\d\s]/g, '');
    onChange({ iso: value.iso, national: cleaned });
  }

  return (
    <div className="form-group">
      <label className="label" htmlFor={id}>
        {label}
        <span className="label-hint">
          {country.name} · +{country.dial}
        </span>
      </label>

      <div className={styles.wrap} data-invalid={invalid || undefined} ref={rootRef}>
        <div className={styles.countryBox}>
          <button
            ref={btnRef}
            type="button"
            className={styles.trigger}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={countryAriaLabel}
            aria-activedescendant={open ? `${listId}-${activeIso}` : undefined}
            onClick={() => setOpen((o) => !o)}
            onKeyDown={onButtonKey}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.flag} src={flagSrc(country.iso)} alt="" width={22} height={16} />
            <span>+{country.dial}</span>
            <svg className={styles.chevron} width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {open && (
            <ul className={styles.menu} id={listId} role="listbox" aria-label={countryAriaLabel}>
              {COUNTRIES.map((c) => (
                <li
                  key={c.iso}
                  id={`${listId}-${c.iso}`}
                  role="option"
                  aria-selected={c.iso === value.iso}
                  className={`${styles.option} ${c.iso === activeIso ? styles.optionActive : ''}`}
                  onMouseEnter={() => setActiveIso(c.iso)}
                  onClick={() => commit(c.iso)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.flag} src={flagSrc(c.iso)} alt="" width={22} height={16} />
                  <span className={styles.optionName}>{c.name}</span>
                  <span className={styles.optionDial}>+{c.dial}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

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
