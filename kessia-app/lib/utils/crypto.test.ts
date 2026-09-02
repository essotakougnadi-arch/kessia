import { describe, it, expect } from 'vitest';
import { normalizePhone, generateInviteCode, generateOtp } from './crypto';

describe('normalizePhone', () => {
  it('ajoute l\'indicatif Togo par défaut', () => {
    expect(normalizePhone('90123456')).toBe('+22890123456');
  });
  it('retire espaces et tirets', () => {
    expect(normalizePhone('+228 90-12-34-56')).toBe('+22890123456');
  });
  it('convertit 00 en +', () => {
    expect(normalizePhone('0022890123456')).toBe('+22890123456');
  });
  it('laisse un numéro déjà normalisé', () => {
    expect(normalizePhone('+22890123456')).toBe('+22890123456');
  });
});

describe('generateInviteCode', () => {
  it('format KESS-XXXXXX sans caractères ambigus', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^KESS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
});

describe('generateOtp', () => {
  it('produit 6 chiffres', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateOtp(6)).toMatch(/^\d{6}$/);
    }
  });
});
