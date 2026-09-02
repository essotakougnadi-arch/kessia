import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { signAccessToken } from '@/lib/auth/session';
import { makeUser, cleanup, settle } from './helpers';

import { GET as adminOverview } from '@/app/api/v1/admin/overview/route';
import { GET as adminUsers } from '@/app/api/v1/admin/users/route';
import { GET as adminTransactions } from '@/app/api/v1/admin/transactions/route';
import { GET as adminTontines } from '@/app/api/v1/admin/tontines/route';
import { GET as adminAnalytics } from '@/app/api/v1/admin/analytics/route';
import { GET as adminModules } from '@/app/api/v1/admin/modules/route';
import { GET as adminFraud } from '@/app/api/v1/admin/fraud/route';
import { GET as adminGuarantee } from '@/app/api/v1/admin/guarantee/route';
import { GET as adminSupport } from '@/app/api/v1/admin/support/route';
import { GET as adminKyc } from '@/app/api/v1/admin/kyc/route';

const userIds: string[] = [];
afterEach(async () => {
  await settle();
  await cleanup({ userIds: userIds.splice(0) });
});

const HANDLERS: Array<[string, (r: NextRequest) => Promise<Response>]> = [
  ['admin/overview', adminOverview as never],
  ['admin/users', adminUsers as never],
  ['admin/transactions', adminTransactions as never],
  ['admin/tontines', adminTontines as never],
  ['admin/analytics', adminAnalytics as never],
  ['admin/modules', adminModules as never],
  ['admin/fraud', adminFraud as never],
  ['admin/guarantee', adminGuarantee as never],
  ['admin/support', adminSupport as never],
  ['admin/kyc', adminKyc as never],
];

function get(path: string, token?: string) {
  return new NextRequest(`http://localhost/api/v1/${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('RBAC back-office — un USER standard est refusé (intégration)', () => {
  it('chaque famille /admin/* renvoie 403 avec un token USER', async () => {
    const u = await makeUser();
    userIds.push(u.id);
    const token = signAccessToken({ sub: u.id, phone: u.phone, role: 'USER' });

    for (const [name, handler] of HANDLERS) {
      const res = await handler(get(name, token));
      expect(res.status, `${name} devrait renvoyer 403 pour un USER`).toBe(403);
    }
  });

  it('sans token, chaque famille /admin/* renvoie 401', async () => {
    for (const [name, handler] of HANDLERS) {
      const res = await handler(get(name));
      expect(res.status, `${name} devrait renvoyer 401 sans token`).toBe(401);
    }
  });

  it('un SUPER_ADMIN (token) passe la garde RBAC (2xx ou 5xx, jamais 401/403)', async () => {
    const u = await makeUser();
    userIds.push(u.id);
    const token = signAccessToken({ sub: u.id, phone: u.phone, role: 'SUPER_ADMIN' });

    for (const [name, handler] of HANDLERS) {
      const res = await handler(get(name, token));
      expect([401, 403], `${name} ne doit pas bloquer un SUPER_ADMIN`).not.toContain(res.status);
    }
  });
});
