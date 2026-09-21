// ============================================================
// KESSIA — lib/logger.ts : rédaction des secrets (P1.9, Lot A)
// ============================================================

import { describe, it, expect } from 'vitest';
import { redact } from './logger';

describe('redact', () => {
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
