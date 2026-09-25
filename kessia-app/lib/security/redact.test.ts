// ============================================================
// KESSIA — lib/security/redact.ts
// Couvre à la fois le comportement historique (extrait de lib/logger.ts,
// utilisé par Winston — test 12 de la correction P1.13-B : ce
// comportement doit rester inchangé) et l'extension de la Correction 4
// (otp/code/pin/iban/cvv/authorization/cookie).
// ============================================================

import { describe, it, expect } from 'vitest';
import { redact } from './redact';

describe('redact — comportement existant (préservé, sert aussi Winston via lib/logger.ts)', () => {
  it("masque les identifiants d'une chaîne de connexion", () => {
    const input = 'Error: connect ECONNREFUSED postgresql://myuser:S3cr3t!@db.example.com:5432/postgres';
    const out = redact(input);
    expect(out).not.toContain('myuser');
    expect(out).not.toContain('S3cr3t!');
    expect(out).toContain('postgresql://***@db.example.com:5432/postgres');
  });

  it('masque la valeur des champs password/secret/token/apiKey', () => {
    expect(redact('password=hunter2')).toBe('password=***');
    expect(redact('token: "eyJhbGciOiJIUzI1NiJ9.abc.def"')).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(redact('{"apiKey":"sk-abcdef123"}')).not.toContain('sk-abcdef123');
    expect(redact('JWT_SECRET=u6LDW3X7ufUF')).not.toContain('u6LDW3X7ufUF');
  });

  it('laisse inchangé un texte sans donnée sensible', () => {
    const input = 'Utilisateur introuvable pour le téléphone +22890000001';
    expect(redact(input)).toBe(input);
  });
});

describe('redact — Correction 4 (otp/code/pin/iban/cvv/authorization/cookie)', () => {
  it('masque un OTP', () => {
    expect(redact('otp=123456')).toBe('otp=***');
    expect(redact('{"otp":"123456"}')).not.toContain('123456');
  });

  it('masque un code (invitation, vérification...)', () => {
    expect(redact('code=KESS-ABC123')).toBe('code=***');
  });

  it('masque un PIN', () => {
    expect(redact('pin=4242')).toBe('pin=***');
  });

  it('masque un IBAN', () => {
    expect(redact('iban=FR7612345987650123456789014')).not.toContain('FR7612345987650123456789014');
  });

  it('masque un CVV', () => {
    expect(redact('cvv=123')).toBe('cvv=***');
  });

  it('masque une valeur Authorization en texte libre', () => {
    expect(redact('authorization: "Bearer secret-token"')).not.toContain('secret-token');
  });

  it('masque une valeur Cookie en texte libre', () => {
    expect(redact('cookie=session=abc123')).not.toContain('abc123');
  });

  it('la comparaison est insensible à la casse', () => {
    expect(redact('OTP=123456')).toBe('OTP=***');
    expect(redact('Iban=FR761234')).not.toContain('FR761234');
  });
});
