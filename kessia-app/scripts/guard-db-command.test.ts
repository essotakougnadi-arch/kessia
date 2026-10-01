// ============================================================
// KESSIA — scripts/guard-db-command.mjs (P1.9, Lot B)
// ============================================================

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isProductionDatabaseUrl,
  isTransactionPoolerUrl,
  redactUrl,
  resolveDatabaseUrl,
  resolveDirectUrl,
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

// ============================================================
// P1.11 — séparation runtime/migration (prisma/schema.prisma :
// datasource.directUrl, ADR 0049). DIRECT_URL est la connexion
// réellement utilisée par `prisma migrate …`/`db push` dès qu'elle est
// présente dans le schéma — elle doit subir exactement les mêmes gardes
// anti-production que DATABASE_URL, PLUS un refus explicite du pooler
// transaction (port 6543 / pgbouncer=true), qui casse le DDL de Prisma
// Migrate (ADR 0002, ADR 0048).
// ============================================================

describe('isTransactionPoolerUrl', () => {
  it('détecte le pooler transaction via le port 6543', () => {
    expect(
      isTransactionPoolerUrl(
        'postgresql://postgres.someref:secret@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
      )
    ).toBe(true);
  });

  it('détecte le pooler transaction via pgbouncer=true, même sur un autre port', () => {
    expect(isTransactionPoolerUrl('postgresql://user:secret@host:5432/postgres?pgbouncer=true')).toBe(true);
  });

  it('accepte le pooler session (port 5432, sans pgbouncer)', () => {
    expect(
      isTransactionPoolerUrl(
        'postgresql://postgres.someref:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres'
      )
    ).toBe(false);
  });

  it('accepte une URL locale sans pooler', () => {
    expect(isTransactionPoolerUrl('postgresql://postgres@127.0.0.1:5433/kessia_p0_test')).toBe(false);
  });

  it('traite une URL malformée ou absente de façon sûre — jamais d’exception, jamais bloquant par défaut', () => {
    expect(() => isTransactionPoolerUrl('ceci-n-est-pas-une-url')).not.toThrow();
    expect(isTransactionPoolerUrl('ceci-n-est-pas-une-url')).toBe(false);
    expect(() => isTransactionPoolerUrl(undefined)).not.toThrow();
    expect(isTransactionPoolerUrl(undefined)).toBe(false);
    expect(() => isTransactionPoolerUrl(null)).not.toThrow();
    expect(() => isTransactionPoolerUrl(123)).not.toThrow();
    expect(() => isTransactionPoolerUrl('')).not.toThrow();
    expect(isTransactionPoolerUrl('')).toBe(false);
  });
});

describe('resolveDirectUrl', () => {
  it('privilégie process.env.DIRECT_URL sur .env', () => {
    expect(
      resolveDirectUrl('/inexistant', { NODE_ENV: 'test', DIRECT_URL: 'postgresql://x' })
    ).toBe('postgresql://x');
  });

  it('retombe sur .env (jamais .env.local) si aucune variable d’environnement n’est déjà exportée', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kessia-guard-test-'));
    try {
      writeFileSync(join(dir, '.env'), 'DIRECT_URL="postgresql://fallback-direct@host/db"\n');
      expect(resolveDirectUrl(dir, { NODE_ENV: 'test' })).toBe('postgresql://fallback-direct@host/db');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renvoie undefined si rien n’est configuré, sans lever', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kessia-guard-test-'));
    try {
      expect(() => resolveDirectUrl(dir, { NODE_ENV: 'test' })).not.toThrow();
      expect(resolveDirectUrl(dir, { NODE_ENV: 'test' })).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('est indépendante de DATABASE_URL — chaque variable se résout séparément', () => {
    expect(
      resolveDirectUrl('/inexistant', {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://runtime-pooler',
        DIRECT_URL: 'postgresql://migration-session',
      })
    ).toBe('postgresql://migration-session');
  });
});

describe('isProductionDatabaseUrl appliqué à DIRECT_URL (même garde que DATABASE_URL)', () => {
  it('détecte une DIRECT_URL de production même sur le port session (5432)', () => {
    const url = `postgresql://postgres.${PRODUCTION_MARKERS[0]}:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`;
    expect(isProductionDatabaseUrl(url)).toBe(true);
  });

  it('accepte une DIRECT_URL de staging (référence différente)', () => {
    expect(
      isProductionDatabaseUrl(
        'postgresql://postgres.xyzstagingref123:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres'
      )
    ).toBe(false);
  });
});
