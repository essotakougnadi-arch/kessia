// ============================================================
// KESSIA — lib/observability/request-id.ts (P1.13-C)
// Couvre les points A-F et la validation stricte (jamais de "nettoyage").
// ============================================================

import { describe, it, expect } from 'vitest';
import { isValidRequestId, resolveRequestId, REQUEST_ID_HEADER } from './request-id';

const VALID_UUID_V4 = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('REQUEST_ID_HEADER', () => {
  it('est le header standard x-request-id', () => {
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });
});

describe('resolveRequestId', () => {
  it('A. aucun x-request-id entrant → un UUID est généré', () => {
    const id = resolveRequestId(null);
    expect(UUID_V4_RE.test(id)).toBe(true);
  });

  it('A bis. x-request-id undefined → un UUID est généré', () => {
    const id = resolveRequestId(undefined);
    expect(UUID_V4_RE.test(id)).toBe(true);
  });

  it('B. x-request-id UUID v4 valide → le même UUID est conservé exactement', () => {
    expect(resolveRequestId(VALID_UUID_V4)).toBe(VALID_UUID_V4);
  });

  it('C. x-request-id invalide (format incorrect) → un nouvel UUID est généré', () => {
    const id = resolveRequestId('not-a-uuid');
    expect(id).not.toBe('not-a-uuid');
    expect(UUID_V4_RE.test(id)).toBe(true);
  });

  it('D. x-request-id trop long → un nouvel UUID est généré (jamais tronqué)', () => {
    const tooLong = VALID_UUID_V4 + 'a'.repeat(1000);
    const id = resolveRequestId(tooLong);
    expect(id).not.toBe(tooLong);
    expect(id.length).toBe(36);
    expect(UUID_V4_RE.test(id)).toBe(true);
  });

  it('E. x-request-id contenant un caractère de contrôle → un nouvel UUID est généré', () => {
    // Même longueur que VALID_UUID_V4 (36) pour isoler le test du seul
    // caractère de contrôle — pas de la longueur.
    const withControlChar = VALID_UUID_V4.slice(0, -1) + '\x00';
    expect(withControlChar.length).toBe(36);
    const id = resolveRequestId(withControlChar);
    expect(id).not.toBe(withControlChar);
    expect(UUID_V4_RE.test(id)).toBe(true);
  });

  it('F. format généré → UUID v4 strict (répété pour couvrir l\'aléatoire)', () => {
    for (let i = 0; i < 25; i++) {
      const id = resolveRequestId(undefined);
      expect(UUID_V4_RE.test(id)).toBe(true);
    }
  });

  it('ne "nettoie" jamais une valeur invalide — remplacement intégral, jamais partiel', () => {
    const id = resolveRequestId('SOME-INVALID-Value-123');
    expect(id).not.toContain('SOME');
    expect(id).not.toContain('INVALID');
    expect(UUID_V4_RE.test(id)).toBe(true);
  });
});

describe('isValidRequestId', () => {
  it('accepte un UUID v4 strict', () => {
    expect(isValidRequestId(VALID_UUID_V4)).toBe(true);
  });

  it('rejette une longueur trop courte', () => {
    expect(isValidRequestId(VALID_UUID_V4.slice(0, -1))).toBe(false);
  });

  it('rejette une longueur trop longue', () => {
    expect(isValidRequestId(VALID_UUID_V4 + 'a')).toBe(false);
  });

  it('rejette un caractère de contrôle', () => {
    expect(isValidRequestId(VALID_UUID_V4.slice(0, -1) + '\x1f')).toBe(false);
  });

  it("rejette un nibble de version incorrect (UUID v1 par ex., pas v4)", () => {
    expect(isValidRequestId('3fa85f64-5717-1562-b3fc-2c963f66afa6')).toBe(false);
  });

  it('rejette un nibble de variant incorrect', () => {
    expect(isValidRequestId('3fa85f64-5717-4562-c3fc-2c963f66afa6')).toBe(false);
  });

  it('rejette une chaîne vide', () => {
    expect(isValidRequestId('')).toBe(false);
  });
});
