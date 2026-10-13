// ============================================================
// KESSIA — Régression de l'incident 2026-10-12 (DROP SCHEMA production)
//
// Preuve que db-test-reset.mjs ne peut plus jamais laisser DIRECT_URL
// non neutralisée, et refuse explicitement toute base de test dont
// DATABASE_URL ou DIRECT_URL correspond à la production connue.
// Aucune commande réelle n'est exécutée : execFileSync est moqué.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { existsSyncMock, readFileSyncMock, execFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  execFileSyncMock: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
}));

const { main } = await import('./db-test-reset.mjs');

const CWD = '/repo';
const SAFE_TEST_DB = 'postgresql://postgres:kessia@127.0.0.1:5433/kessia_test';
const SAFE_TEST_DIRECT = 'postgresql://postgres:kessia@127.0.0.1:5433/kessia_test_direct';
const DEMO_DB = 'postgresql://postgres:demo@demo.supabase.co:5432/postgres';
const DEMO_DIRECT = 'postgresql://postgres:demo@demo.supabase.co:5432/postgres?direct=1';
const PRODUCTION_DB = 'postgresql://postgres.uwvnarmojdbutbunzqww:x@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

/** Env minimal valide pour NodeJS.ProcessEnv, avec surcharges ciblées par test. */
function testEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: 'test', ...overrides };
}

/** Simule le contenu de .env.test / .env.local / .env vus par readEnvVar. */
function mockFiles(files: Record<string, string>) {
  existsSyncMock.mockImplementation((p: string) => Object.keys(files).some((f) => p.endsWith(f)));
  readFileSyncMock.mockImplementation((p: string) => {
    const key = Object.keys(files).find((f) => p.endsWith(f));
    return key ? files[key] : '';
  });
}

let exitSpy: any;
let errorSpy: any;
let logSpy: any;

beforeEach(() => {
  vi.clearAllMocks();
  exitSpy = vi.fn((_code?: number) => undefined as never);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('db-test-reset.mjs — garde anti-production (régression incident 2026-10-12)', () => {
  it('refuse si aucune base de test configurée (.env.test absent, E2E_DATABASE_URL absente)', () => {
    mockFiles({});
    main({ cwd: CWD, env: testEnv(), exit: exitSpy });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('refuse si DATABASE_URL de test == DATABASE_URL de démo (.env.local)', () => {
    mockFiles({
      '.env.test': `DATABASE_URL="${DEMO_DB}"\nDIRECT_URL="${SAFE_TEST_DIRECT}"\n`,
      '.env.local': `DATABASE_URL="${DEMO_DB}"\n`,
    });
    main({ cwd: CWD, env: testEnv(), exit: exitSpy });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('refuse si DIRECT_URL de test == DIRECT_URL de démo, même si DATABASE_URL diffère', () => {
    mockFiles({
      '.env.test': `DATABASE_URL="${SAFE_TEST_DB}"\nDIRECT_URL="${DEMO_DIRECT}"\n`,
      '.env.local': `DATABASE_URL="${DEMO_DB}"\nDIRECT_URL="${DEMO_DIRECT}"\n`,
    });
    main({ cwd: CWD, env: testEnv(), exit: exitSpy });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('refuse si DATABASE_URL de test correspond à la référence de projet Supabase de PRODUCTION', () => {
    mockFiles({
      '.env.test': `DATABASE_URL="${PRODUCTION_DB}"\nDIRECT_URL="${SAFE_TEST_DIRECT}"\n`,
    });
    main({ cwd: CWD, env: testEnv(), exit: exitSpy });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.flat().join(' ')).toContain('PRODUCTION');
  });

  it("régression exacte de l'incident : DATABASE_URL de test sûre, mais DIRECT_URL résout vers la PRODUCTION — refusé", () => {
    mockFiles({
      '.env.test': `DATABASE_URL="${SAFE_TEST_DB}"\nDIRECT_URL="${PRODUCTION_DB}"\n`,
    });
    main({ cwd: CWD, env: testEnv(), exit: exitSpy });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it("si .env.test ne définit pas DIRECT_URL du tout, elle reprend DATABASE_URL (jamais laissée à Prisma/.env) et le run réussit", () => {
    mockFiles({
      '.env.test': `DATABASE_URL="${SAFE_TEST_DB}"\n`,
    });
    main({ cwd: CWD, env: testEnv(), exit: exitSpy });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(execFileSyncMock).toHaveBeenCalledTimes(2);
    const firstCallEnv = execFileSyncMock.mock.calls[0][2].env;
    expect(firstCallEnv.DATABASE_URL).toBe(SAFE_TEST_DB);
    expect(firstCallEnv.DIRECT_URL).toBe(SAFE_TEST_DB); // jamais undefined
  });

  it('avec deux URL de test sûres et distinctes de la démo : reset puis seed exécutés, avec DIRECT_URL explicitement transmise', () => {
    mockFiles({
      '.env.test': `DATABASE_URL="${SAFE_TEST_DB}"\nDIRECT_URL="${SAFE_TEST_DIRECT}"\n`,
      '.env.local': `DATABASE_URL="${DEMO_DB}"\nDIRECT_URL="${DEMO_DIRECT}"\n`,
    });
    main({ cwd: CWD, env: testEnv(), exit: exitSpy });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(execFileSyncMock).toHaveBeenCalledTimes(2);

    const [resetCmd, resetArgs, resetOpts] = execFileSyncMock.mock.calls[0];
    expect(resetCmd).toBe('npx');
    expect(resetArgs).toEqual(['prisma', 'migrate', 'reset', '--force', '--skip-generate', '--skip-seed']);
    expect(resetOpts.env.DATABASE_URL).toBe(SAFE_TEST_DB);
    expect(resetOpts.env.DIRECT_URL).toBe(SAFE_TEST_DIRECT);

    const [seedCmd, seedArgs, seedOpts] = execFileSyncMock.mock.calls[1];
    expect(seedCmd).toBe('npx');
    expect(seedArgs).toEqual(['tsx', 'prisma/seed.ts']);
    expect(seedOpts.env.DATABASE_URL).toBe(SAFE_TEST_DB);
    expect(seedOpts.env.DIRECT_URL).toBe(SAFE_TEST_DIRECT);
  });

  it('E2E_DATABASE_URL (variable d\'environnement) a priorité sur .env.test, et reste soumise aux mêmes gardes', () => {
    mockFiles({});
    main({ cwd: CWD, env: testEnv({ E2E_DATABASE_URL: PRODUCTION_DB }), exit: exitSpy });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });
});
