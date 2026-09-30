// ============================================================
// KESSIA — P1.13-D puis P1.13-E, correction des fuites console.*
//
// P1.13-D — empêche le retour des trois occurrences identifiées par
// l'audit P1.13-D (OTP + téléphone / e-mail en clair via
// console.log/info, contournant Winston et devenant des breadcrumbs
// Sentry non rédigés) :
// - app/api/v1/auth/request-otp/route.ts
// - app/api/v1/auth/register/route.ts
// - lib/email/email.ts
//
// P1.13-E — même classe de fuite (console.error/warn/info bruts,
// hors Winston/redaction), identifiée par l'audit P1.13-E dans 8
// fichiers lib/ supplémentaires (chemins d'erreur « best-effort », pas
// le flux nominal) :
// - lib/audit/audit.service.ts
// - lib/auth/roles.ts
// - lib/fraud/devices.ts
// - lib/fraud/engine.ts
// - lib/guarantee/guarantee.service.ts
// - lib/notifications/notify.ts
// - lib/storage/supabase-storage.ts
// - lib/tontine/events.ts
//
// Deux niveaux de protection testés :
// 1. Statique : le code source de ces fichiers ne contient plus aucun
//    `console.log(/info(/warn(/error(/debug(` (regression guard direct,
//    indépendant de tout mock).
// 2. Comportemental : les chemins réels n'appellent jamais console.*,
//    et le logger KESSIA reçoit une méta saine (sans OTP, téléphone,
//    e-mail complet, titre de notification ou clé de service).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';

const FIXED_FILES = [
  'app/api/v1/auth/request-otp/route.ts',
  'app/api/v1/auth/register/route.ts',
  'lib/email/email.ts',
];

const P1_13_E_FIXED_FILES = [
  'lib/audit/audit.service.ts',
  'lib/auth/roles.ts',
  'lib/fraud/devices.ts',
  'lib/fraud/engine.ts',
  'lib/guarantee/guarantee.service.ts',
  'lib/notifications/notify.ts',
  'lib/storage/supabase-storage.ts',
  'lib/tontine/events.ts',
];

describe('1. Garde statique — aucun console.log/console.info dans les fichiers corrigés (P1.13-D)', () => {
  for (const relativePath of FIXED_FILES) {
    it(`${relativePath} ne contient plus console.log(/console.info(`, () => {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
      expect(source).not.toMatch(/console\.(log|info)\(/);
    });
  }
});

describe('1bis. Garde statique — aucun console.* dans les fichiers corrigés (P1.13-E)', () => {
  for (const relativePath of P1_13_E_FIXED_FILES) {
    it(`${relativePath} ne contient plus console.log(/info(/warn(/error(/debug(`, () => {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
      expect(source).not.toMatch(/console\.(log|info|warn|error|debug)\(/);
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
      update: vi.fn().mockResolvedValue({ id: 'user-1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    // P1.13-E — sous-objets additionnels pour les tests comportementaux
    // des 8 fichiers lib/ corrigés ci-dessous. Valeurs par défaut neutres ;
    // chaque test surcharge uniquement l'appel dont il a besoin via
    // mockRejectedValueOnce/mockResolvedValueOnce.
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    device: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({ id: 'device-1', trusted: false, seenCount: 1 }),
      create: vi.fn().mockResolvedValue({ id: 'device-1', trusted: true }),
    },
    wallet: { findFirst: vi.fn().mockResolvedValue(null) },
    guaranteeClaim: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    guaranteeEvent: { create: vi.fn().mockResolvedValue({ id: 'ge-1' }) },
    notification: {
      create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    userProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    tontineEvent: { create: vi.fn().mockResolvedValue({ id: 'te-1' }) },
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

// ============================================================
// 4. Comportemental — les 8 fichiers lib/ corrigés en P1.13-E
//
// Pour chacun : force le chemin catch (rejet Prisma), vérifie que
// console.error n'est JAMAIS appelé et que logger.error reçoit
// l'évènement structuré attendu avec une méta saine.
// ============================================================

describe('4a. lib/audit/audit.service.ts — recordAudit', () => {
  it("échec prisma.auditLog.create : logger.error('audit_write_failed'), jamais console.error", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: prisma } = await import('../db/prisma');
    const { logger } = await import('../logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(new Error('db down'));

    try {
      const { recordAudit } = await import('../audit/audit.service');
      await recordAudit({ userId: 'user-1', action: 'test.action', entity: 'Test' });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      const calls = errorSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const call = calls.find(([event]) => event === 'audit_write_failed');
      expect(call).toBeDefined();
      expect(call![1].action).toBe('test.action');
    } finally {
      consoleErrorSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('4b. lib/auth/roles.ts — elevateRole', () => {
  it("échec prisma.user.update : logger.error('role_elevation_failed'), jamais console.error", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: prisma } = await import('../db/prisma');
    const { logger } = await import('../logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ role: 'USER' } as never);
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('db down'));

    try {
      const { elevateRole } = await import('../auth/roles');
      await elevateRole('user-1', 'BUSINESS_OWNER');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      const calls = errorSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const call = calls.find(([event]) => event === 'role_elevation_failed');
      expect(call).toBeDefined();
      expect(call![1].target).toBe('BUSINESS_OWNER');
    } finally {
      consoleErrorSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('4c. lib/fraud/devices.ts — recordDevice', () => {
  it("échec prisma.device.findUnique : logger.error('fraud_record_device_failed'), jamais console.error", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: prisma } = await import('../db/prisma');
    const { logger } = await import('../logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    vi.mocked(prisma.device.findUnique).mockRejectedValueOnce(new Error('db down'));

    try {
      const { recordDevice } = await import('../fraud/devices');
      const result = await recordDevice('user-1', { headers: { get: () => null } });

      expect(result).toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      const calls = errorSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const call = calls.find(([event]) => event === 'fraud_record_device_failed');
      expect(call).toBeDefined();
      expect(call![1].userId).toBe('user-1');
    } finally {
      consoleErrorSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('4d. lib/fraud/engine.ts — assessEvent', () => {
  it("échec prisma.user.findUnique : logger.error('fraud_assess_event_failed'), jamais console.error", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: prisma } = await import('../db/prisma');
    const { logger } = await import('../logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    // recordDevice (appelé en premier par assessEvent) échoue proprement
    // et se logge lui-même (4c) — sans rapport avec l'assertion ici.
    vi.mocked(prisma.device.findUnique).mockRejectedValueOnce(new Error('device down'));
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('db down'));

    try {
      const { assessEvent } = await import('../fraud/engine');
      const result = await assessEvent({
        userId: 'user-1',
        context: 'login',
        request: { headers: { get: () => null } },
      });

      expect(result).toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      const calls = errorSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const call = calls.find(([event]) => event === 'fraud_assess_event_failed');
      expect(call).toBeDefined();
      expect(call![1].userId).toBe('user-1');
      expect(call![1].context).toBe('login');
    } finally {
      consoleErrorSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('4e. lib/guarantee/guarantee.service.ts — reviewClaim (event interne)', () => {
  it("échec prisma.guaranteeEvent.create : logger.error('guarantee_event_failed'), jamais console.error", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: prisma } = await import('../db/prisma');
    const { logger } = await import('../logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    vi.mocked(prisma.guaranteeClaim.findUnique).mockResolvedValueOnce({
      id: 'claim-1', status: 'PENDING', amountRequested: 1000, userId: 'user-1',
    } as never);
    vi.mocked(prisma.guaranteeClaim.update).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.guaranteeEvent.create).mockRejectedValueOnce(new Error('db down'));

    try {
      const { reviewClaim } = await import('../guarantee/guarantee.service');
      const result = await reviewClaim({
        claimId: 'claim-1', decision: 'REJECTED', note: 'Motif de test', reviewerId: 'admin-1',
      });

      expect(result.ok).toBe(true);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      const calls = errorSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const call = calls.find(([event]) => event === 'guarantee_event_failed');
      expect(call).toBeDefined();
      expect(call![1].claimId).toBe('claim-1');
      expect(call![1].actorId).toBe('admin-1');
    } finally {
      consoleErrorSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('4f. lib/notifications/notify.ts — notify / notifyMany', () => {
  it("échec prisma.notification.create : logger.error('notify_write_failed'), sans le titre, jamais console.error", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: prisma } = await import('../db/prisma');
    const { logger } = await import('../logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    vi.mocked(prisma.notification.create).mockRejectedValueOnce(new Error('db down'));

    try {
      const { notify } = await import('../notifications/notify');
      await notify({ userId: 'user-1', category: 'SECURITY', title: 'Titre secret', body: 'Corps' });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      const calls = errorSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const call = calls.find(([event]) => event === 'notify_write_failed');
      expect(call).toBeDefined();
      expect(call![1].userId).toBe('user-1');
      expect(call![1].category).toBe('SECURITY');
      expect(JSON.stringify(call![1])).not.toContain('Titre secret');
    } finally {
      consoleErrorSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("échec prisma.notification.createMany : logger.error('notify_write_failed_bulk'), sans le titre, jamais console.error", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: prisma } = await import('../db/prisma');
    const { logger } = await import('../logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    vi.mocked(prisma.notification.createMany).mockRejectedValueOnce(new Error('db down'));

    try {
      const { notifyMany } = await import('../notifications/notify');
      await notifyMany(['user-1', 'user-2'], { category: 'SECURITY', title: 'Titre secret', body: 'Corps' });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      const calls = errorSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const call = calls.find(([event]) => event === 'notify_write_failed_bulk');
      expect(call).toBeDefined();
      expect(call![1].recipientCount).toBe(2);
      expect(JSON.stringify(call![1])).not.toContain('Titre secret');
    } finally {
      consoleErrorSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('4g. lib/storage/supabase-storage.ts — putObject / signObjectUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("putObject, réponse non-ok : logger.error('storage_put_object_failed'), jamais console.error, jamais la clé de service", async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'super-secret-service-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'Forbidden' }));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logger } = await import('../logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    try {
      const { putObject } = await import('../storage/supabase-storage');
      const result = await putObject('kyc-documents', 'user-1/piece.jpg', Buffer.from('x'), 'image/jpeg');

      expect(result).toBe(false);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      const calls = errorSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const call = calls.find(([event]) => event === 'storage_put_object_failed');
      expect(call).toBeDefined();
      expect(call![1].status).toBe(403);
      expect(JSON.stringify(call![1])).not.toContain('super-secret-service-key');
    } finally {
      consoleErrorSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("signObjectUrl, exception réseau : logger.error('storage_sign_object_url_error'), jamais console.error", async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'super-secret-service-key');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logger } = await import('../logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    try {
      const { signObjectUrl } = await import('../storage/supabase-storage');
      const result = await signObjectUrl('kyc-documents', 'user-1/piece.jpg');

      expect(result).toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      const calls = errorSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const call = calls.find(([event]) => event === 'storage_sign_object_url_error');
      expect(call).toBeDefined();
      expect(JSON.stringify(call![1])).not.toContain('super-secret-service-key');
    } finally {
      consoleErrorSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('4h. lib/tontine/events.ts — recordTontineEvent', () => {
  it("échec prisma.tontineEvent.create : logger.error('tontine_event_write_failed'), jamais console.error", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: prisma } = await import('../db/prisma');
    const { logger } = await import('../logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    vi.mocked(prisma.tontineEvent.create).mockRejectedValueOnce(new Error('db down'));

    try {
      const { recordTontineEvent } = await import('../tontine/events');
      await recordTontineEvent({ tontineId: 'tontine-1', type: 'CREATED' });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      const calls = errorSpy.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const call = calls.find(([event]) => event === 'tontine_event_write_failed');
      expect(call).toBeDefined();
      expect(call![1].tontineId).toBe('tontine-1');
      expect(call![1].type).toBe('CREATED');
    } finally {
      consoleErrorSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
