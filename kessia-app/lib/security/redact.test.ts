// ============================================================
// KESSIA — lib/security/redact.ts
// Couvre à la fois le comportement historique (extrait de lib/logger.ts,
// utilisé par Winston — test 12 de la correction P1.13-B : ce
// comportement doit rester inchangé) et l'extension de la Correction 4
// (otp/code/pin/iban/cvv/authorization/cookie).
// ============================================================

import { describe, it, expect } from 'vitest';
import { redact, redactDeep } from './redact';

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

// ============================================================
// P1.13-D — redactDeep() sur de VRAIS objets JavaScript structurés
// (pas des chaînes déjà sérialisées passées à redact()). Avant cette
// correction, redactDeep({ password: 'hunter2' }) ne masquait RIEN :
// redact() ne matche que du texte libre "clé: valeur" dans une même
// chaîne — une fois la valeur séparée de sa clé par la structure de
// l'objet, aucun motif ne survivait. Ces tests couvrent précisément ce
// chemin, resté sans couverture jusqu'ici (audit P1.13-D).
// ============================================================
describe('redactDeep — objets structurés (P1.13-D, gap confirmé par audit)', () => {
  it('redactDeep({ password: "secret" }) masque la valeur', () => {
    const out = redactDeep({ password: 'secret' }) as Record<string, unknown>;
    expect(out.password).toBe('***');
    expect(JSON.stringify(out)).not.toContain('secret');
  });

  it('objet imbriqué contenant otp', () => {
    const out = redactDeep({
      phone: '+22890000001',
      data: { otp: '123456' },
    }) as { phone: string; data: { otp: unknown } };
    expect(out.data.otp).toBe('***');
    expect(JSON.stringify(out)).not.toContain('123456');
  });

  it('objet contenant token', () => {
    const out = redactDeep({ accessToken: 'eyJhbGciOiJIUzI1NiJ9.abc.def' }) as Record<string, unknown>;
    expect(out.accessToken).toBe('***');
    expect(JSON.stringify(out)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('objet contenant authorization', () => {
    const out = redactDeep({ headers: { authorization: 'Bearer secret-token' } }) as {
      headers: { authorization: unknown };
    };
    expect(out.headers.authorization).toBe('***');
    expect(JSON.stringify(out)).not.toContain('secret-token');
  });

  it('combinaison de champs sensibles et non sensibles — seuls les sensibles sont masqués', () => {
    const input = {
      route: '/v1/auth/login',
      requestId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      password: 'hunter2',
      secret: 'top-secret-value',
      apiKey: 'sk-abcdef123456',
      pin: '4242',
      iban: 'FR7612345987650123456789014',
      cvv: '123',
      cookie: 'session=abc123',
      count: 3,
      status: 'ok',
    };
    const out = redactDeep(input) as Record<string, unknown>;

    // Champs sensibles : masqués.
    expect(out.password).toBe('***');
    expect(out.secret).toBe('***');
    expect(out.apiKey).toBe('***');
    expect(out.pin).toBe('***');
    expect(out.iban).toBe('***');
    expect(out.cvv).toBe('***');
    expect(out.cookie).toBe('***');

    // Champs non sensibles : conservés tels quels.
    expect(out.route).toBe('/v1/auth/login');
    expect(out.requestId).toBe('3fa85f64-5717-4562-b3fc-2c963f66afa6');
    expect(out.count).toBe(3);
    expect(out.status).toBe('ok');

    // Aucune valeur sensible ne survit dans la sortie sérialisée.
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('top-secret-value');
    expect(serialized).not.toContain('sk-abcdef123456');
    expect(serialized).not.toContain('4242');
    expect(serialized).not.toContain('FR7612345987650123456789014');
    expect(serialized).not.toContain('abc123');
  });

  it('variantes de casse/séparateurs sur le nom de clé (api_key, API_KEY, ApiKey)', () => {
    const out = redactDeep({ api_key: 'a', API_KEY: 'b', ApiKey: 'c' }) as Record<string, unknown>;
    expect(out.api_key).toBe('***');
    expect(out.API_KEY).toBe('***');
    expect(out.ApiKey).toBe('***');
  });

  it('un tableau d\'objets sensibles est masqué élément par élément', () => {
    const out = redactDeep([{ password: 'a' }, { password: 'b' }, { ok: true }]) as Array<
      Record<string, unknown>
    >;
    expect(out[0].password).toBe('***');
    expect(out[1].password).toBe('***');
    expect(out[2].ok).toBe(true);
  });
});
