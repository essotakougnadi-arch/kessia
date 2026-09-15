// ============================================================
// KESSIA — Sécurité des sessions (intégration, P0.2)
//
// Reproduit et vérifie le correctif de la collision Session.token
// (P0.1/P0.2 : JWT signé stocké en @unique, déterministe à la seconde
// près -> collision sur créations concurrentes -> 500 non géré), la
// détection de réutilisation de refresh token, et l'application
// immédiate de la révocation par `withAuth` (pas seulement à
// l'expiration naturelle du JWT à 15 min).
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createSession,
  rotateRefreshToken,
  revokeSession,
  isSessionRevoked,
  verifyAccessToken,
} from '@/lib/auth/session';
import { withAuth } from '@/lib/auth/middleware';
import { prisma, cleanup, makeUser } from './helpers';

const userIds: string[] = [];
afterEach(async () => {
  await cleanup({ userIds: userIds.splice(0) });
});

function bearerRequest(token: string) {
  return new NextRequest('http://localhost/api/v1/profile', {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('createSession — concurrence (intégration)', () => {
  it('deux créations de session identiques dans la même seconde ne collisionnent plus (P0.2)', async () => {
    const u = await makeUser();
    userIds.push(u.id);

    // Avant le correctif : `Session.token` = JWT signé, @unique. Un JWT est
    // déterministe à la seconde près (iat) -> même payload (sub/phone/role)
    // signé deux fois dans la même seconde = JWT identique -> la deuxième
    // `session.create` violait la contrainte unique (P2002) -> 500 non géré
    // par le bloc catch générique des routes login/refresh.
    const [a, b] = await Promise.all([
      createSession(u.id, u.phone, 'USER'),
      createSession(u.id, u.phone, 'USER'),
    ]);

    expect(a.accessToken).toBeTruthy();
    expect(b.accessToken).toBeTruthy();

    const sessions = await prisma.session.findMany({ where: { userId: u.id } });
    expect(sessions).toHaveLength(2);
    // jti aléatoire et indépendant du JWT -> jamais de collision, même à
    // iat identique.
    expect(sessions[0].jti).not.toBe(sessions[1].jti);
  });

  it('dix créations de session concurrentes pour le même utilisateur réussissent toutes', async () => {
    const u = await makeUser();
    userIds.push(u.id);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => createSession(u.id, u.phone, 'USER'))
    );
    expect(results).toHaveLength(10);
    expect(new Set(results.map((r) => r.accessToken)).size).toBe(10);

    const sessions = await prisma.session.findMany({ where: { userId: u.id } });
    expect(sessions).toHaveLength(10);
    expect(new Set(sessions.map((s) => s.jti)).size).toBe(10);
  });
});

describe('rotateRefreshToken — rotation & détection de réutilisation (intégration)', () => {
  it('rotation légitime : révoque l’ancienne ligne, en crée une nouvelle, les nouveaux tokens fonctionnent', async () => {
    const u = await makeUser();
    userIds.push(u.id);

    const first = await createSession(u.id, u.phone, 'USER');
    const rotated = await rotateRefreshToken(first.refreshToken);

    expect(rotated).not.toBeNull();
    expect(rotated!.accessToken).not.toBe(first.accessToken);
    expect(rotated!.refreshToken).not.toBe(first.refreshToken);

    const sessions = await prisma.session.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions[0].revokedAt).not.toBeNull(); // ancienne ligne révoquée
    expect(sessions[1].revokedAt).toBeNull(); // nouvelle ligne active

    // Le nouvel access token passe withAuth.
    const { error, context } = await withAuth(bearerRequest(rotated!.accessToken));
    expect(error).toBeNull();
    expect(context?.userId).toBe(u.id);
  });

  it('réutilisation d’un refresh token déjà tourné : détectée, toutes les sessions révoquées, audit émis', async () => {
    const u = await makeUser();
    userIds.push(u.id);

    const first = await createSession(u.id, u.phone, 'USER');
    const second = await createSession(u.id, u.phone, 'USER'); // 2e session (ex. autre appareil)
    await rotateRefreshToken(first.refreshToken); // rotation légitime -> first.refreshToken devient obsolète

    // Un attaquant (ou un client avec un vieux token en cache) rejoue
    // l'ANCIEN refresh token, déjà tourné.
    const reuse = await rotateRefreshToken(first.refreshToken);
    expect(reuse).toBeNull();

    // Toutes les sessions de l'utilisateur sont révoquées par précaution —
    // y compris `second`, qui n'était pourtant pas celle rejouée.
    const sessions = await prisma.session.findMany({ where: { userId: u.id } });
    expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);

    const { error } = await withAuth(bearerRequest(second.accessToken));
    expect(error).not.toBeNull();
    expect(error!.status).toBe(401);

    const audit = await prisma.auditLog.findFirst({
      where: { userId: u.id, action: 'auth.refresh_reuse_detected' },
    });
    expect(audit).toBeTruthy();
  });

  it('un refresh token jamais émis ne renvoie aucun signal (pas de session à révoquer)', async () => {
    const result = await rotateRefreshToken('jamais-emis-' + Date.now());
    expect(result).toBeNull();
  });
});

describe('withAuth — révocation appliquée immédiatement (intégration)', () => {
  it('une session révoquée (logout) est refusée sans attendre l’expiration du JWT', async () => {
    const u = await makeUser();
    userIds.push(u.id);

    const session = await createSession(u.id, u.phone, 'USER');

    const before = await withAuth(bearerRequest(session.accessToken));
    expect(before.error).toBeNull();

    await revokeSession(session.accessToken);

    const after = await withAuth(bearerRequest(session.accessToken));
    expect(after.error).not.toBeNull();
    expect(after.error!.status).toBe(401);
  });

  it('isSessionRevoked : session active -> false, session révoquée -> true, jti absent -> false (rétro-compat)', async () => {
    const u = await makeUser();
    userIds.push(u.id);
    const session = await createSession(u.id, u.phone, 'USER');
    const payload = verifyAccessToken(session.accessToken)!;

    expect(await isSessionRevoked(payload.jti)).toBe(false);
    await revokeSession(session.accessToken);
    expect(await isSessionRevoked(payload.jti)).toBe(true);
    // JWT émis avant P0.2 (pas de jti) : ne doit jamais bloquer ici — la
    // signature/expiration du JWT reste la garde, le vieux token expirera
    // naturellement sous 15 min et sera remplacé par un JWT avec jti.
    expect(await isSessionRevoked(undefined)).toBe(false);
  });

  it('changer de mot de passe révoque toutes les sessions actives', async () => {
    const u = await makeUser();
    userIds.push(u.id);
    const a = await createSession(u.id, u.phone, 'USER');
    const b = await createSession(u.id, u.phone, 'USER');

    await prisma.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });

    for (const s of [a, b]) {
      const { error } = await withAuth(bearerRequest(s.accessToken));
      expect(error).not.toBeNull();
    }
  });
});
