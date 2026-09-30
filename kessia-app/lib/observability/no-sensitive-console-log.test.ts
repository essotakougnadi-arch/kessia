// ============================================================
// KESSIA — P1.13-D, correction des fuites console.*
//
// Empêche le retour des trois occurrences identifiées par l'audit
// P1.13-D (OTP + téléphone / e-mail en clair via console.log/info,
// contournant Winston et devenant des breadcrumbs Sentry non rédigés) :
// - app/api/v1/auth/request-otp/route.ts
// - app/api/v1/auth/register/route.ts
// - lib/email/email.ts
//
// Deux niveaux de protection testés :
// 1. Statique : le code source de ces 3 fichiers ne contient plus
//    `console.log(`/`console.info(` du tout (regression guard direct,
//    indépendant de tout mock).
// 2. Comportemental : les chemins réels (request-otp, sendEmail)
//    n'appellent jamais console.*, et le logger KESSIA ne reçoit ni
//    l'OTP, ni le téléphone complet, ni l'adresse e-mail complète.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';

const FIXED_FILES = [
  'app/api/v1/auth/request-otp/route.ts',
  'app/api/v1/auth/register/route.ts',
  'lib/email/email.ts',
];

describe('1. Garde statique — aucun console.log/console.info dans les fichiers corrigés', () => {
  for (const relativePath of FIXED_FILES) {
    it(`${relativePath} ne contient plus console.log(/console.info(`, () => {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
      expect(source).not.toMatch(/console\.(log|info)\(/);
    });
  }
});

const { setTagMock } = vi.hoisted(() => ({ setTagMock: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({
  setTag: setTagMock,
  setContext: vi.fn(),
  setExtra: vi.fn(),
}));

vi.mock('@/lib/security/rate-limit', () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(null), // jamais limité
}));

vi.mock('@/lib/db/prisma', () => ({
  default: {
    otpCode: {
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'otp-1' }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'user-1', phone: '+22890000001' }),
    },
  },
}));

describe('2. Comportemental — POST /api/v1/auth/request-otp', () => {
  beforeEach(() => {
    vi.stubEnv('SMS_PROVIDER', 'DEV');
  });

  it("n'appelle jamais console.log, et le logger ne reçoit ni l'OTP ni le téléphone complet", async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { logger } = await import('../logger');
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

    try {
      const { POST } = await import('../../app/api/v1/auth/request-otp/route');
      const request = {
        headers: { get: () => null },
        json: async () => ({ phone: '+22890000001', purpose: 'LOGIN' }),
      } as unknown as NextRequest;

      await POST(request);

      expect(consoleLogSpy).not.toHaveBeenCalled();

      const calls = infoSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const otpLogCall = calls.find(([event]) => event === 'otp_dev_mode');
      expect(otpLogCall).toBeDefined();
      const [, meta] = otpLogCall!;
      const serialized = JSON.stringify(meta);
      expect(serialized).not.toContain('+22890000001');
      // Aucun champ à 6 chiffres (forme d'un OTP) dans les métadonnées.
      expect(serialized).not.toMatch(/\b\d{6}\b/);
    } finally {
      consoleLogSpy.mockRestore();
      infoSpy.mockRestore();
    }
  });
});

describe("3. Comportemental — sendEmail (simulation, sans fournisseur configuré)", () => {
  it("n'appelle jamais console.info, et le logger ne reçoit pas l'adresse e-mail complète", async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { logger } = await import('../logger');
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

    try {
      const { sendEmail } = await import('../email/email');
      await sendEmail({ to: 'utilisateur-test@example.com', subject: 'Reçu', text: 'contenu' });

      expect(consoleInfoSpy).not.toHaveBeenCalled();

      const calls = infoSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const emailLogCall = calls.find(([event]) => event === 'email_simulated');
      expect(emailLogCall).toBeDefined();
      const [, meta] = emailLogCall!;
      expect(JSON.stringify(meta)).not.toContain('utilisateur-test@example.com');
      expect(meta.domain).toBe('example.com');
    } finally {
      consoleInfoSpy.mockRestore();
      infoSpy.mockRestore();
    }
  });
});
