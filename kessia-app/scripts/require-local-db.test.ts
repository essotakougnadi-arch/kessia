// ============================================================
// KESSIA — Preuve (entièrement simulée) du correctif proposé pour
// l'incident du 2026-10-12 : une commande Prisma ad hoc, lancée avec
// DATABASE_URL remplacée mais DIRECT_URL non remplacée, s'est connectée
// à un hôte distant (le repli silencieux sur .env). Voir
// docs/audit/INCIDENT_2026-10-12_prisma_adhoc_connection.md.
//
// Aucune commande réelle, aucune connexion réseau : node:fs est moqué.
// Ce fichier ne fait que prouver la LOGIQUE du module proposé
// scripts/require-local-db.mjs — il ne se connecte à rien et n'exécute
// aucun binaire Prisma. Conformément à l'instruction du propriétaire,
// aucune vérification contre une vraie base (locale ou distante) n'a
// été effectuée pour produire ce fichier.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { existsSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

const { assertLocalTestPair, isLoopbackUrl, redactUrl } = await import('./require-local-db.mjs');

const CWD = '/repo';
const LOCAL = 'postgresql://postgres@127.0.0.1:5433/kessia_p0_test';
const LOCAL_LOCALHOST = 'postgresql://postgres@localhost:5433/kessia_p0_test';
// Hôte réellement contacté pendant l'incident (pooler Supabase générique,
// jamais une vraie valeur de secret — uniquement le nom d'hôte observé
// dans la sortie de `prisma migrate status`, voir le rapport d'incident).
const REMOTE = 'postgresql://postgres.someproject:x@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

function mockEnvTest(databaseUrl: string | undefined) {
  existsSyncMock.mockImplementation((p: string) => p.endsWith('.env.test'));
  readFileSyncMock.mockImplementation((p: string) => {
    if (p.endsWith('.env.test') && databaseUrl) return `DATABASE_URL="${databaseUrl}"\n`;
    return '';
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertLocalTestPair — régression exacte de l\'incident 2026-10-12', () => {
  it("DATABASE_URL remplacée mais DIRECT_URL absente (exactement l'incident) : refusé", () => {
    mockEnvTest(LOCAL);
    const r = assertLocalTestPair({ databaseUrl: LOCAL, directUrl: undefined, cwd: CWD });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/DIRECT_URL/);
  });

  it('les deux variables absentes : refusé', () => {
    mockEnvTest(LOCAL);
    const r = assertLocalTestPair({ cwd: CWD });
    expect(r.ok).toBe(false);
  });

  it('DATABASE_URL et DIRECT_URL diffèrent entre elles : refusé', () => {
    mockEnvTest(LOCAL);
    const r = assertLocalTestPair({ databaseUrl: LOCAL, directUrl: LOCAL_LOCALHOST, cwd: CWD });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/diffèrent/);
  });

  it('les deux identiques mais ne correspondant pas à .env.test : refusé', () => {
    mockEnvTest(LOCAL);
    const r = assertLocalTestPair({ databaseUrl: REMOTE, directUrl: REMOTE, cwd: CWD });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/env\.test/);
  });

  it('les deux identiques, correspondant à .env.test, mais .env.test lui-même pointerait vers un hôte distant : refusé (défense en profondeur)', () => {
    mockEnvTest(REMOTE); // .env.test mal configuré, hypothèse volontairement pessimiste
    const r = assertLocalTestPair({ databaseUrl: REMOTE, directUrl: REMOTE, cwd: CWD });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/loopback/);
  });

  it('.env.test introuvable : refusé, jamais un crash', () => {
    existsSyncMock.mockReturnValue(false);
    const r = assertLocalTestPair({ databaseUrl: LOCAL, directUrl: LOCAL, cwd: CWD });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/env\.test/);
  });

  it('les deux identiques, correspondant à .env.test, hôte loopback (127.0.0.1) : accepté', () => {
    mockEnvTest(LOCAL);
    const r = assertLocalTestPair({ databaseUrl: LOCAL, directUrl: LOCAL, cwd: CWD });
    expect(r.ok).toBe(true);
  });

  it('variante localhost (au lieu de 127.0.0.1) : accepté si cohérente avec .env.test', () => {
    mockEnvTest(LOCAL_LOCALHOST);
    const r = assertLocalTestPair({ databaseUrl: LOCAL_LOCALHOST, directUrl: LOCAL_LOCALHOST, cwd: CWD });
    expect(r.ok).toBe(true);
  });
});

describe('isLoopbackUrl', () => {
  it('127.0.0.1 et localhost sont loopback ; un hôte de pooler Supabase ne l\'est jamais', () => {
    expect(isLoopbackUrl(LOCAL)).toBe(true);
    expect(isLoopbackUrl(LOCAL_LOCALHOST)).toBe(true);
    expect(isLoopbackUrl(REMOTE)).toBe(false);
    expect(isLoopbackUrl('not a url')).toBe(false);
    expect(isLoopbackUrl(undefined as unknown as string)).toBe(false);
  });
});

describe('redactUrl', () => {
  it('ne révèle jamais les identifiants', () => {
    expect(redactUrl(REMOTE)).not.toContain('someproject');
    expect(redactUrl(REMOTE)).toContain('***');
    expect(redactUrl(undefined as unknown as string)).toBe('(absent)');
  });
});
