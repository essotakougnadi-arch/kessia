import { describe, it, expect } from 'vitest';
import {
  COUNTRIES,
  DEFAULT_COUNTRY_ISO,
  findCountry,
  toE164,
  isNationalLengthPlausible,
} from './countries';

describe('countries', () => {
  it('contient le Togo par défaut et des indicatifs uniques par ISO', () => {
    expect(findCountry(DEFAULT_COUNTRY_ISO).iso).toBe('TG');
    const isos = COUNTRIES.map((c) => c.iso);
    expect(new Set(isos).size).toBe(isos.length);
  });

  it('chaque pays a un drapeau, un indicatif numérique et min <= max', () => {
    for (const c of COUNTRIES) {
      expect(c.flag).not.toBe('');
      expect(c.dial).toMatch(/^\d+$/);
      expect(c.min).toBeLessThanOrEqual(c.max);
    }
  });

  it('findCountry retombe sur le défaut pour un code inconnu', () => {
    expect(findCountry('ZZ').iso).toBe('TG');
    expect(findCountry(null).iso).toBe('TG');
  });

  it('toE164 compose un numéro international et retire le 0 initial', () => {
    expect(toE164('TG', '90 12 34 56')).toBe('+22890123456');
    expect(toE164('CI', '0123456789')).toBe('+225123456789');
    expect(toE164('FR', '06 12 34 56 78')).toBe('+33612345678');
    expect(toE164('TG', '')).toBe('');
  });

  it('isNationalLengthPlausible valide la longueur nationale', () => {
    expect(isNationalLengthPlausible('TG', '90123456')).toBe(true);
    expect(isNationalLengthPlausible('TG', '9012')).toBe(false);
    expect(isNationalLengthPlausible('SN', '701234567')).toBe(true);
    expect(isNationalLengthPlausible('TG', '')).toBe(false);
  });
});
