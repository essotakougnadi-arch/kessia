import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v1/auth/register/route';
import { LEGAL_VERSION } from '@/lib/legal/versions';
import { prisma, cleanup, throwawayPhone, settle } from './helpers';

const userIds: string[] = [];
const phones: string[] = [];
afterEach(async () => {
  await settle();
  await cleanup({ userIds: userIds.splice(0), phones: phones.splice(0) });
});

function registerRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const base = {
  firstName: 'Inte', lastName: 'Gration', password: 'Kessia2026!',
  consentTerms: true, consentData: true,
};

describe('POST /api/v1/auth/register (intégration)', () => {
  it('crée compte + profil + wallet dans une transaction, avec la version des CGU + audit', async () => {
    const phone = throwawayPhone();
    phones.push(phone);

    const res = await POST(registerRequest({ ...base, phone, userType: 'MICRO_ENTERPRISE' }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { userId: string } };
    userIds.push(body.data.userId);

    const user = await prisma.user.findUnique({
      where: { id: body.data.userId },
      include: { wallet: true, profile: true },
    });
    expect(user?.termsAcceptedVersion).toBe(LEGAL_VERSION);
    expect(user?.termsAcceptedAt).toBeTruthy();
    expect(user?.wallet).toBeTruthy();
    expect(user?.profile?.userType).toBe('MICRO_ENTERPRISE');

    await settle();
    const audit = await prisma.auditLog.findFirst({
      where: { userId: body.data.userId, action: 'auth.register' },
    });
    expect(audit, 'une ligne d’audit auth.register doit être écrite').toBeTruthy();
    expect((audit?.metadata as Record<string, unknown> | null)?.termsVersion).toBe(LEGAL_VERSION);
  });

  it('un numéro déjà enregistré renvoie 409 sans créer de second compte', async () => {
    const phone = throwawayPhone();
    phones.push(phone);

    const first = await POST(registerRequest({ ...base, phone }));
    expect(first.status).toBe(201);
    userIds.push(((await first.json()) as { data: { userId: string } }).data.userId);

    const dup = await POST(registerRequest({ ...base, phone }));
    expect(dup.status).toBe(409);

    const count = await prisma.user.count({ where: { phone } });
    expect(count).toBe(1);
  });

  it('un consentement manquant est rejeté (400)', async () => {
    const phone = throwawayPhone();
    phones.push(phone);
    const res = await POST(registerRequest({ ...base, phone, consentData: false }));
    expect(res.status).toBe(400);
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });
});
