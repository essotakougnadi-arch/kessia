// ============================================================
// KESSIA — middleware.ts (P1.13-C)
// Couvre G (header x-request-id sur la réponse) et la non-régression
// de la logique de protection de routes existante (première couverture
// de test de ce fichier — aucune n'existait avant P1.13-C).
//
// `jose.jwtVerify` est mocké pour piloter précisément les claims sans
// dépendre d'un vrai secret JWT partagé entre `jsonwebtoken` (signature,
// lib/auth/session.ts) et `jose` (vérification, middleware.ts).
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { jwtVerifyMock } = vi.hoisted(() => ({ jwtVerifyMock: vi.fn() }));
vi.mock('jose', () => ({
  jwtVerify: jwtVerifyMock,
}));

import { middleware } from './middleware';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function makeRequest(path: string, opts?: { requestId?: string; token?: string }): NextRequest {
  const headers = new Headers();
  if (opts?.requestId) headers.set('x-request-id', opts.requestId);
  if (opts?.token) headers.set('cookie', `kessia-access-token=${opts.token}`);
  return new NextRequest(new URL(path, 'https://kessia.app'), { headers });
}

beforeEach(() => {
  jwtVerifyMock.mockReset();
  jwtVerifyMock.mockRejectedValue(new Error('no token / invalid by default'));
});

describe('middleware — request-id (G)', () => {
  it('G. une page publique reçoit un x-request-id sur la réponse', async () => {
    const res = await middleware(makeRequest('/login'));
    const id = res.headers.get('x-request-id');
    expect(id).not.toBeNull();
    expect(UUID_V4_RE.test(id!)).toBe(true);
  });

  it('G. une route API reçoit un x-request-id sur la réponse', async () => {
    const res = await middleware(makeRequest('/api/v1/wallet'));
    const id = res.headers.get('x-request-id');
    expect(id).not.toBeNull();
    expect(UUID_V4_RE.test(id!)).toBe(true);
  });

  it('un x-request-id entrant valide (UUID v4) est conservé exactement sur la réponse', async () => {
    const res = await middleware(makeRequest('/api/v1/wallet', { requestId: VALID_UUID }));
    expect(res.headers.get('x-request-id')).toBe(VALID_UUID);
  });

  it('un x-request-id entrant invalide est remplacé par un nouvel UUID sur la réponse', async () => {
    const res = await middleware(makeRequest('/api/v1/wallet', { requestId: 'not-a-uuid' }));
    const id = res.headers.get('x-request-id');
    expect(id).not.toBe('not-a-uuid');
    expect(UUID_V4_RE.test(id!)).toBe(true);
  });

  it('un x-request-id sur une réponse de redirection (route protégée non connectée)', async () => {
    const res = await middleware(makeRequest('/wallet'));
    expect(res.status).toBe(307); // redirection Next.js par défaut
    const id = res.headers.get('x-request-id');
    expect(id).not.toBeNull();
    expect(UUID_V4_RE.test(id!)).toBe(true);
  });
});

describe('middleware — non-régression de la protection de routes existante', () => {
  it('route protégée sans token → redirige vers /login avec ?from=', async () => {
    const res = await middleware(makeRequest('/wallet'));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('from')).toBe('/wallet');
  });

  it('route API jamais redirigée par la logique de protection de pages (bypass confirmé)', async () => {
    const res = await middleware(makeRequest('/api/v1/wallet'));
    expect(res.status).not.toBe(307);
    expect(res.headers.get('location')).toBeNull();
  });

  it('route /admin avec un rôle insuffisant → redirige vers /home', async () => {
    jwtVerifyMock.mockResolvedValue({ payload: { sub: 'user-1', role: 'USER' } });
    const res = await middleware(makeRequest('/admin', { token: 'fake.jwt.token' }));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/home');
  });

  it('route /admin avec un rôle admin → laisse passer (pas de redirection)', async () => {
    jwtVerifyMock.mockResolvedValue({ payload: { sub: 'user-1', role: 'SUPER_ADMIN' } });
    const res = await middleware(makeRequest('/admin', { token: 'fake.jwt.token' }));
    expect(res.headers.get('location')).toBeNull();
  });

  it('déjà connecté sur /login → redirige vers /home', async () => {
    jwtVerifyMock.mockResolvedValue({ payload: { sub: 'user-1', role: 'USER' } });
    const res = await middleware(makeRequest('/login', { token: 'fake.jwt.token' }));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/home');
  });

  it('page non protégée, non connectée → laisse passer normalement (/discover, publique)', async () => {
    const res = await middleware(makeRequest('/discover'));
    expect(res.headers.get('location')).toBeNull();
  });
});
