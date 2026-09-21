// ============================================================
// KESSIA — scripts/guard-db-command.mjs (P1.9, Lot B)
// ============================================================

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isProductionDatabaseUrl,
  redactUrl,
  resolveDatabaseUrl,
  PRODUCTION_MARKERS,
} from './guard-db-command.mjs';

describe('isProductionDatabaseUrl', () => {
  it('détecte une URL de production connue et la bloque', () => {
    const url = `postgresql://postgres.${PRODUCTION_MARKERS[0]}:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`;
    expect(isProductionDatabaseUrl(url)).toBe(true);
  });

  it('accepte une URL locale', () => {
    expect(isProductionDatabaseUrl('postgresql://postgres@127.0.0.1:5433/kessia_p0_test')).toBe(false);
  });

  it('accepte une URL de test (CI éphémère)', () => {
    expect(isProductionDatabaseUrl('postgresql://kessia:kessia@localhost:5432/kessia_itest')).toBe(false);
  });

  it('accepte une URL de staging (référence de projet différente de la production)', () => {
    expect(
      isProductionDatabaseUrl(
        'postgresql://postgres.xyzstagingref123:secret@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
      )
    ).toBe(false);
  });

  it('traite une URL malformée ou absente de façon sûre — jamais d’exception, jamais bloquant par défaut', () => {
    expect(() => isProductionDatabaseUrl('ceci-n-est-pas-une-url')).not.toThrow();
    expect(isProductionDatabaseUrl('ceci-n-est-pas-une-url')).toBe(false);
    expect(() => isProductionDatabaseUrl(undefined)).not.toThrow();
    expect(isProductionDatabaseUrl(undefined)).toBe(false);
    expect(() => isProductionDatabaseUrl(null)).not.toThrow();
    expect(() => isProductionDatabaseUrl(123)).not.toThrow();
    expect(() => isProductionDatabaseUrl('')).not.toThrow();
    expect(isProductionDatabaseUrl('')).toBe(false);
  });
});

describe('redactUrl', () => {
  it('ne laisse jamais les identifiants d’une URL de connexion dans le résultat', () => {
    const url = 'postgresql://myuser:S3cr3tPassword@db.example.com:5432/postgres';
    const out = redactUrl(url);
    expect(out).not.toContain('myuser');
    expect(out).not.toContain('S3cr3tPassword');
    expect(out).toBe('postgresql://***@db.example.com:5432/postgres');
  });

  it('ne lève pas et renvoie un indicateur neutre pour une URL absente', () => {
    expect(redactUrl(undefined)).toBe('(absent)');
  });
});

describe('resolveDatabaseUrl', () => {
  it('privilégie process.env.DATABASE_URL sur .env', () => {
    expect(
      resolveDatabaseUrl('/inexistant', { NODE_ENV: 'test', DATABASE_URL: 'postgresql://x' })
    ).toBe('postgresql://x');
  });

  it('retombe sur .env (jamais .env.local) si aucune variable d’environnement n’est déjà exportée', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kessia-guard-test-'));
    try {
      writeFileSync(join(dir, '.env'), 'DATABASE_URL="postgresql://fallback@host/db"\n');
      expect(resolveDatabaseUrl(dir, { NODE_ENV: 'test' })).toBe('postgresql://fallback@host/db');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renvoie undefined si rien n’est configuré, sans lever', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kessia-guard-test-'));
    try {
      expect(() => resolveDatabaseUrl(dir, { NODE_ENV: 'test' })).not.toThrow();
      expect(resolveDatabaseUrl(dir, { NODE_ENV: 'test' })).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
