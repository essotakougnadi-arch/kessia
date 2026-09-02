import { describe, it, expect } from 'vitest';
import { isTermsUpToDate, LEGAL_VERSION } from './versions';

describe('isTermsUpToDate', () => {
  it('faux si aucune version acceptée', () => {
    expect(isTermsUpToDate(null)).toBe(false);
    expect(isTermsUpToDate(undefined)).toBe(false);
    expect(isTermsUpToDate('')).toBe(false);
  });

  it('faux si une version antérieure a été acceptée', () => {
    expect(isTermsUpToDate('2025-01-01')).toBe(false);
  });

  it('vrai si la version acceptée est la version en vigueur', () => {
    expect(isTermsUpToDate(LEGAL_VERSION)).toBe(true);
  });
});
