import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema, verifyOtpSchema } from './auth';

const base = {
  phone: '+22890123456',
  firstName: 'Kossi',
  lastName: 'Amétépé',
  password: 'Kessia2026',
};

describe('registerSchema', () => {
  it('exige les deux consentements', () => {
    expect(registerSchema.safeParse({ ...base, consentTerms: true, consentData: true }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, consentTerms: true, consentData: false }).success).toBe(false);
    expect(registerSchema.safeParse(base).success).toBe(false);
  });

  it('refuse un mot de passe sans majuscule ni chiffre', () => {
    const r = registerSchema.safeParse({ ...base, password: 'motdepasse', consentTerms: true, consentData: true });
    expect(r.success).toBe(false);
  });

  it('refuse un prénom trop court', () => {
    const r = registerSchema.safeParse({ ...base, firstName: 'K', consentTerms: true, consentData: true });
    expect(r.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepte téléphone + mot de passe', () => {
    expect(loginSchema.safeParse({ phone: '+22890123456', password: 'x' }).success).toBe(true);
  });
  it('refuse un téléphone au format invalide', () => {
    expect(loginSchema.safeParse({ phone: 'abc', password: 'x' }).success).toBe(false);
  });
});

describe('verifyOtpSchema', () => {
  it('exige un code à 6 chiffres', () => {
    expect(verifyOtpSchema.safeParse({ phone: '+22890123456', code: '123456', purpose: 'REGISTER' }).success).toBe(true);
    expect(verifyOtpSchema.safeParse({ phone: '+22890123456', code: '12345', purpose: 'REGISTER' }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ phone: '+22890123456', code: 'abcdef', purpose: 'REGISTER' }).success).toBe(false);
  });
});
