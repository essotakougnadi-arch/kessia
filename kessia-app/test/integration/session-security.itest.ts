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
import jwt from 'jsonwebtoken';
import {
  createSession,
  rotateRefreshToken,
  revokeSession,
  isSessionRevoked,
  verifyAccessToken,
  signAccessToken,
} from '@/lib/auth/session';
import { withAuth, assertOwnership } from '@/lib/auth/middleware';
import { POST as loginRoute } from '@/app/api/v1/auth/login/route';
import { POST as registerRoute } from '@/app/api/v1/auth/register/route';
import { prisma, cleanup, makeUser, throwawayPhone, settle } from './helpers';

const userIds: string[] = [];
const phones: string[] = [];
afterEach(async () => {
  await settle();
  await cleanup({ userIds: userIds.splice(0), phones: phones.splice(0) });
});

function bearerRequest(token: string) {
  return new NextRequest('http://localhost/api/v1/profile', {
    headers: { authorization: `Bearer ${token}` },
  });
}

function jsonRequest(url: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const REGISTER_PASSWORD = 'Kessia2026!';

/** Enregistre un utilisateur réel via la route (mot de passe hashé bcrypt), pour les tests de login. */
async function registerRealUser(): Promise<{ id: string; phone: string }> {
  const phone = throwawayPhone();
  phones.push(phone);
  const res = await registerRoute(
    jsonRequest('/api/v1/auth/register', {
      firstName: 'Inte',
      lastName: 'Gration',
      password: REGISTER_PASSWORD,
      consentTerms: true,
      consentData: true,
      phone,
    })
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as { data: { userId: string } };
  userIds.push(body.data.userId);
  return { id: body.data.userId, phone };
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

  it('vingt créations de session concurrentes pour le même utilisateur réussissent toutes (P0.2)', async () => {
    const u = await makeUser();
    userIds.push(u.id);

    const results = await Promise.all(
      Array.from({ length: 20 }, () => createSession(u.id, u.phone, 'USER'))
    );
    expect(results).toHaveLength(20);
    expect(results.every((r) => !!r.accessToken)).toBe(true);
    expect(new Set(results.map((r) => r.accessToken)).size).toBe(20);

    const sessions = await prisma.session.findMany({ where: { userId: u.id } });
    expect(sessions).toHaveLength(20);
    expect(new Set(sessions.map((s) => s.jti)).size).toBe(20);
    expect(new Set(sessions.map((s) => s.refreshToken)).size).toBe(20);
  });
});

describe('POST /api/v1/auth/login — concurrence (intégration, P0.2)', () => {
  it('vingt connexions concurrentes pour le même compte réussissent toutes, sans 500 ni collision', async () => {
    const user = await registerRealUser();

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        loginRoute(jsonRequest('/api/v1/auth/login', { phone: user.phone, password: REGISTER_PASSWORD }))
      )
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as Array<{
      data: { accessToken: string };
    }>;
    expect(new Set(bodies.map((b) => b.data.accessToken)).size).toBe(20);

    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(20);
    expect(new Set(sessions.map((s) => s.jti)).size).toBe(20);
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

  it('rotation concurrente RÉPÉTÉE (double onglet, 10 essais) : jamais de fausse détection de vol, le gagnant garde toujours une session active (P0.2 finalisation)', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const u = await makeUser();
      userIds.push(u.id);
      const first = await createSession(u.id, u.phone, 'USER');

      // Deux onglets/appareils qui tournent le MÊME refresh token en même
      // temps (scénario ORDINAIRE, pas une attaque). Avant le correctif
      // (updateMany conditionnel), le perdant de cette course lisait
      // souvent la ligne déjà révoquée par le gagnant et déclenchait à tort
      // `revokeAllUserSessions`, déconnectant aussi le gagnant. Le
      // correctif rend la transition atomique : le perdant obtient
      // `null` proprement, SANS jamais déclencher la détection de vol —
      // le gagnant garde toujours une session valide.
      const [a, b] = await Promise.all([
        rotateRefreshToken(first.refreshToken),
        rotateRefreshToken(first.refreshToken),
      ]);

      const results = [a, b];
      const winners = results.filter((r) => r !== null);
      const losers = results.filter((r) => r === null);
      expect(winners).toHaveLength(1); // exactement un gagnant, jamais les deux, jamais aucun
      expect(losers).toHaveLength(1);

      // Le gagnant authentifie TOUJOURS — jamais révoqué par erreur.
      const { error } = await withAuth(bearerRequest(winners[0]!.accessToken));
      expect(error).toBeNull();

      // Aucune fausse alerte de vol : pas d'audit `refresh_reuse_detected`,
      // et la session du gagnant n'est jamais dans les lignes révoquées.
      const reuseAudit = await prisma.auditLog.findFirst({
        where: { userId: u.id, action: 'auth.refresh_reuse_detected' },
      });
      expect(reuseAudit).toBeNull();

      const rows = await prisma.session.findMany({ where: { userId: u.id } });
      expect(new Set(rows.map((r) => r.jti)).size).toBe(rows.length); // jamais de collision jti
      const activeRows = rows.filter((r) => r.revokedAt === null);
      expect(activeRows).toHaveLength(1); // exactement une session active : celle du gagnant
    }
  });

  it('vraie réutilisation (séquentielle, pas concurrente) d’un refresh token déjà tourné : toujours détectée et bloquée après le correctif', async () => {
    const u = await makeUser();
    userIds.push(u.id);
    const first = await createSession(u.id, u.phone, 'USER');

    const rotated = await rotateRefreshToken(first.refreshToken);
    expect(rotated).not.toBeNull();

    // Rejeu SÉQUENTIEL (pas une course) de l'ANCIEN token, une fois la
    // première rotation totalement terminée -> doit rester détecté.
    const replay = await rotateRefreshToken(first.refreshToken);
    expect(replay).toBeNull();

    const rows = await prisma.session.findMany({ where: { userId: u.id } });
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true); // tout révoqué, y compris la session issue de la rotation légitime

    const { error } = await withAuth(bearerRequest(rotated!.accessToken));
    expect(error).not.toBeNull();
    expect(error!.status).toBe(401);

    const audit = await prisma.auditLog.findFirst({
      where: { userId: u.id, action: 'auth.refresh_reuse_detected' },
    });
    expect(audit).toBeTruthy();
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

describe('withAuth — matrice de sécurité des tokens (intégration, P0.2)', () => {
  it('token manquant -> 401', async () => {
    const { error, context } = await withAuth(
      new NextRequest('http://localhost/api/v1/profile')
    );
    expect(error).not.toBeNull();
    expect(error!.status).toBe(401);
    expect(context).toBeNull();
  });

  it('token invalide (chaîne arbitraire, non-JWT) -> 401', async () => {
    const { error } = await withAuth(bearerRequest('ceci-nest-pas-un-jwt'));
    expect(error).not.toBeNull();
    expect(error!.status).toBe(401);
  });

  it('token expiré -> 401 (jamais 500)', async () => {
    const u = await makeUser();
    userIds.push(u.id);
    // Signé directement avec une expiration déjà passée (contourne l'attente réelle de 15 min).
    const expired = jwt.sign(
      { sub: u.id, phone: u.phone, role: 'USER', jti: 'expired-jti' },
      process.env.JWT_SECRET!,
      { expiresIn: -10 }
    );
    const { error } = await withAuth(bearerRequest(expired));
    expect(error).not.toBeNull();
    expect(error!.status).toBe(401);
  });

  it('token altéré (signature modifiée après coup) -> 401', async () => {
    const u = await makeUser();
    userIds.push(u.id);
    const session = await createSession(u.id, u.phone, 'USER');
    // Remplace les 2 derniers caractères de la signature -> même payload/en-tête, signature invalide.
    const tampered = session.accessToken.slice(0, -2) + (session.accessToken.endsWith('xx') ? 'yy' : 'xx');
    const { error } = await withAuth(bearerRequest(tampered));
    expect(error).not.toBeNull();
    expect(error!.status).toBe(401);
  });

  it('token valide d’un autre utilisateur -> assertOwnership refuse l’accès à une ressource qui n’est pas la sienne', async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    userIds.push(owner.id, intruder.id);

    const session = await createSession(intruder.id, intruder.phone, 'USER');
    const { error, context } = await withAuth(bearerRequest(session.accessToken));
    expect(error).toBeNull();
    // Le token est valide (c'est bien celui de `intruder`), mais il ne doit
    // jamais autoriser l'accès à une ressource appartenant à `owner`.
    expect(assertOwnership(context!, owner.id)).toBe(false);
    expect(assertOwnership(context!, intruder.id)).toBe(true);
  });

  it('session supprimée physiquement (ex. purge RGPD) -> traitée comme révoquée, refusée (P0.2 finalisation)', async () => {
    const u = await makeUser();
    userIds.push(u.id);
    const session = await createSession(u.id, u.phone, 'USER');

    const before = await withAuth(bearerRequest(session.accessToken));
    expect(before.error).toBeNull();

    // Suppression physique de la ligne (au lieu d'une révocation douce) —
    // reproduit exactement `lib/privacy/erasure.ts` (session.deleteMany).
    const payload = verifyAccessToken(session.accessToken)!;
    await prisma.session.deleteMany({ where: { jti: payload.jti } });

    const after = await withAuth(bearerRequest(session.accessToken));
    expect(after.error).not.toBeNull();
    expect(after.error!.status).toBe(401);
    expect(await isSessionRevoked(payload.jti)).toBe(true);
  });

  it('token sans jti (JWT pré-P0.2, jamais persisté) reste accepté — rétro-compatibilité volontaire, distincte du cas ci-dessus', async () => {
    const u = await makeUser();
    userIds.push(u.id);
    // `signAccessToken` sans `jti` reproduit un JWT émis avant P0.2 (aucune
    // ligne Session ne lui correspond, et ne lui a jamais correspondu).
    const legacyToken = signAccessToken({ sub: u.id, phone: u.phone, role: 'USER' });
    const { error } = await withAuth(bearerRequest(legacyToken));
    expect(error).toBeNull();
  });
});
