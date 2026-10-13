// ============================================================
// KESSIA — Preuve (entièrement simulée) du relais proposé pour
// l'incident du 2026-10-12 : exécute une commande Prisma UNIQUEMENT si
// DATABASE_URL/DIRECT_URL forment la paire locale attendue.
//
// Aucune commande réelle n'est jamais exécutée dans ce fichier :
// execFileSync ET node:fs sont moqués. Chaque test qui s'attend à un
// refus vérifie explicitement que le mock d'exécution n'a PAS été
// appelé — c'est la preuve concrète que la commande réelle n'aurait
// pas tourné, pas seulement que la fonction a renvoyé une erreur.
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

const { main } = await import('./run-local-only.mjs');

const CWD = '/repo';
const LOCAL = 'postgresql://postgres@127.0.0.1:5433/kessia_p0_test';
// Hôte réellement contacté pendant l'incident (nom d'hôte observé dans
// la sortie de `prisma migrate status`, jamais un vrai secret).
const REMOTE = 'postgresql://postgres.someproject:x@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

function mockEnvTestFile(databaseUrl: string | undefined, directUrl?: string) {
  existsSyncMock.mockImplementation((p: string) => p.endsWith('.env.test'));
  readFileSyncMock.mockImplementation((p: string) => {
    if (!p.endsWith('.env.test')) return '';
    let content = '';
    if (databaseUrl) content += `DATABASE_URL="${databaseUrl}"\n`;
    if (directUrl) content += `DIRECT_URL="${directUrl}"\n`;
    return content;
  });
}

function testEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: 'test', ...overrides };
}

let exitSpy: ReturnType<typeof vi.fn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  exitSpy = vi.fn((_code?: number) => undefined as never);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('run-local-only.mjs — régression exacte de l\'incident 2026-10-12', () => {
  it("même forme exacte que l'incident (DATABASE_URL fournie localement, DIRECT_URL absente de l'environnement) — mais l'incident n'est PAS reproduit : DIRECT_URL retombe sur .env.test puis sur databaseUrl, JAMAIS sur le .env réel comme le faisait l'appel ad hoc incriminé — la cible reste locale, la commande s'exécute en sécurité", () => {
    mockEnvTestFile(LOCAL); // .env.test ne définit que DATABASE_URL
    main({
      argv: ['prisma', 'migrate', 'status'],
      cwd: CWD,
      env: testEnv({ DATABASE_URL: LOCAL }), // DIRECT_URL absent de l'environnement, exactement comme l'incident
      exit: exitSpy,
      exec: execFileSyncMock,
    });

    // C'est la preuve que ce relais corrige le mécanisme de l'incident :
    // la même omission (DIRECT_URL non fournie) ne fait plus jamais
    // retomber sur le .env réel, donc ne peut plus jamais faire fuiter
    // vers un hôte distant par ce chemin précis.
    expect(execFileSyncMock).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    const [, , options] = execFileSyncMock.mock.calls[0]!;
    expect((options as { env: NodeJS.ProcessEnv }).env.DIRECT_URL).toBe(LOCAL);
  });

  it("scénario réellement dangereux (DATABASE_URL elle-même mal substituée vers l'hôte distant de l'incident, DIRECT_URL absente) : refusé, exec jamais appelé", () => {
    mockEnvTestFile(LOCAL); // .env.test (la référence) reste local
    main({
      argv: ['prisma', 'migrate', 'status'],
      cwd: CWD,
      env: testEnv({ DATABASE_URL: REMOTE }), // typo/mauvaise variable d'environnement active
      exit: exitSpy,
      exec: execFileSyncMock,
    });

    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    const calls = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes('REFUS'))).toBe(true);
  });

  it('aucune commande fournie : refus immédiat, exec jamais appelé', () => {
    main({ argv: [], cwd: CWD, env: testEnv(), exit: exitSpy, exec: execFileSyncMock });
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('paire locale valide (DATABASE_URL et DIRECT_URL explicitement fournis, identiques, loopback, correspondant à .env.test) : la commande réelle (moquée) est exécutée avec les deux variables explicites', () => {
    mockEnvTestFile(LOCAL, LOCAL);
    main({
      argv: ['prisma', 'migrate', 'status'],
      cwd: CWD,
      env: testEnv({ DATABASE_URL: LOCAL, DIRECT_URL: LOCAL }),
      exit: exitSpy,
      exec: execFileSyncMock,
    });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    const [cmd, args, options] = execFileSyncMock.mock.calls[0]!;
    expect(cmd).toBe('prisma');
    expect(args).toEqual(['migrate', 'status']);
    expect((options as { env: NodeJS.ProcessEnv }).env.DATABASE_URL).toBe(LOCAL);
    expect((options as { env: NodeJS.ProcessEnv }).env.DIRECT_URL).toBe(LOCAL);
  });

  it('.env.test absent et aucune variable fournie : refusé, exec jamais appelé', () => {
    existsSyncMock.mockReturnValue(false);
    main({ argv: ['prisma', 'migrate', 'status'], cwd: CWD, env: testEnv(), exit: exitSpy, exec: execFileSyncMock });
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('DATABASE_URL distante ET DIRECT_URL distante (toutes deux fournies, identiques, mais ne correspondant pas à .env.test) : refusé, exec jamais appelé', () => {
    mockEnvTestFile(LOCAL);
    main({
      argv: ['prisma', 'migrate', 'status'],
      cwd: CWD,
      env: testEnv({ DATABASE_URL: REMOTE, DIRECT_URL: REMOTE }),
      exit: exitSpy,
      exec: execFileSyncMock,
    });
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('aucune valeur de secret (mot de passe) n\'apparaît dans les logs d\'erreur', () => {
    mockEnvTestFile(LOCAL);
    main({
      argv: ['prisma', 'migrate', 'status'],
      cwd: CWD,
      env: testEnv({ DATABASE_URL: REMOTE, DIRECT_URL: REMOTE }),
      exit: exitSpy,
      exec: execFileSyncMock,
    });
    const allLoggedText = [...errorSpy.mock.calls, ...logSpy.mock.calls].map((c) => String(c[0])).join('\n');
    expect(allLoggedText).not.toContain('someproject');
  });
});
