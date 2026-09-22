// ============================================================
// KESSIA — JWT Session Management
// Access token (15min) + Refresh token (30j)
// ============================================================

import jwt from 'jsonwebtoken';
import { generateSecureToken, hashToken } from '../utils/crypto';
import prisma from '../db/prisma';
import { recordAudit } from '../audit/audit.service';
import { notify } from '../notifications/notify';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '30d';

export type JwtPayload = {
  sub: string;       // userId
  phone: string;
  role: string;
  jti?: string;       // identifiant de session (Session.jti) — absent sur les JWT émis avant P0.2
  iat?: number;
  exp?: number;
};

// ---- Sign tokens ----

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRY } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRY,
  } as jwt.SignOptions);
}

// ---- Verify tokens ----

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { sub: string };
  } catch {
    return null;
  }
}

// ---- Create session ----

/**
 * Crée une session : signe un JWT d'accès et génère un refresh token.
 *
 * P0.2 : `jti` (identifiant de session, aléatoire — `generateSecureToken`)
 * remplace le JWT signé comme clé unique en base. Avant ce correctif,
 * `Session.token` stockait le JWT lui-même en `@unique` ; or un JWT est
 * déterministe à la seconde près (`iat`), donc deux sessions créées pour
 * le même utilisateur dans la même seconde (double clic, double onglet,
 * connexions rapprochées en suite E2E) produisaient un JWT strictement
 * identique → violation de la contrainte unique → 500 non géré. `jti` est
 * un token aléatoire indépendant du contenu/timing du JWT : la probabilité
 * de collision est négligeable (2^-192), donc plus de conflit possible.
 */
export async function createSession(
  userId: string,
  phone: string,
  role: string,
  meta?: { deviceInfo?: string; ipAddress?: string }
) {
  const jti = generateSecureToken(24);
  const accessToken = signAccessToken({ sub: userId, phone, role, jti });
  const rawRefreshToken = generateSecureToken(48);
  const hashedRefreshToken = hashToken(rawRefreshToken);

  // Expiry = 30 jours
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      jti,
      refreshToken: hashedRefreshToken,
      deviceInfo: meta?.deviceInfo,
      ipAddress: meta?.ipAddress,
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken, // On retourne le token brut (non hashé) au client
    expiresAt,
  };
}

// ---- Revoke session ----

/** Révocation douce (logout) : marque la session `revokedAt`, ne la supprime pas (trace d'audit). */
export async function revokeSession(accessToken: string): Promise<void> {
  const payload = verifyAccessToken(accessToken);
  if (!payload?.jti) return;
  await prisma.session.updateMany({
    where: { jti: payload.jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Révoque toutes les sessions actives d'un utilisateur (changement de mot de passe, suspension admin). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Vérifie qu'une session (par `jti`) existe toujours et n'est pas révoquée.
 * Utilisé par `withAuth` pour que la révocation soit effective immédiatement
 * (auparavant : seule l'expiration naturelle du JWT à 15 min faisait foi,
 * une session révoquée restait donc utilisable jusqu'à 15 min — finding
 * CRITICAL de l'audit prod-readiness).
 *
 * Rétro-compatibilité : un JWT émis avant ce correctif n'a pas de `jti`
 * (`undefined`) — dans ce cas on ne bloque pas (il expirera naturellement
 * sous 15 min et sera remplacé par un JWT avec `jti` au prochain
 * login/refresh). Pas de déconnexion de masse au déploiement.
 *
 * P0.2 (finalisation) : un `jti` PRÉSENT mais introuvable en base est
 * désormais traité comme révoqué. Avant ce correctif, une session dont la
 * ligne était supprimée physiquement (`session.deleteMany`, ex. purge RGPD
 * `lib/privacy/erasure.ts::eraseUserAccount`) restait acceptée par
 * `withAuth` jusqu'à l'expiration naturelle du JWT (15 min) — le token
 * émis avant la suppression continuait de fonctionner. Sans risque de
 * régression pour la rétro-compatibilité ci-dessus : ce cas ne s'applique
 * qu'aux JWT qui PORTENT un `jti` (émis par `createSession`/
 * `rotateRefreshToken`, donc avec une ligne `Session` créée dans la même
 * opération) — jamais aux anciens JWT sans `jti` du tout, qui restent
 * couverts par le `if (!jti) return false` ci-dessus.
 */
export async function isSessionRevoked(jti: string | undefined): Promise<boolean> {
  if (!jti) return false;
  const session = await prisma.session.findUnique({
    where: { jti },
    select: { revokedAt: true },
  });
  if (!session) return true;
  return session.revokedAt != null;
}

// ---- Rotate refresh token ----

/**
 * Rotation du refresh token, avec détection de réutilisation (OWASP) :
 * chaque rotation révoque la ligne courante et en crée une nouvelle (au
 * lieu de muter la même ligne en place). Si un refresh token déjà révoqué
 * (donc déjà tourné une fois) est présenté à nouveau, c'est le signal
 * standard d'un vol de token → toutes les sessions de l'utilisateur sont
 * révoquées par précaution, un audit + une notification SECURITY sont émis.
 *
 * P0.2 (finalisation) — course corrigée : la lecture initiale
 * (`session.revokedAt` ci-dessous) détecte une VRAIE réutilisation (token
 * déjà révoqué avant même cet appel). Mais deux rotations concurrentes
 * LÉGITIMES du même token (double onglet/appareil) peuvent toutes deux
 * lire `revokedAt: null` avant qu'aucune n'ait écrit (TOCTOU) — l'ancienne
 * version révoquait alors sans condition, si bien que l'appel arrivé en
 * second lisait souvent la ligne déjà révoquée par le premier et
 * déclenchait à tort la détection de vol (`revokeAllUserSessions`),
 * déconnectant l'utilisateur légitime de partout. Corrigé en rendant la
 * transition elle-même atomique et conditionnelle (`updateMany` avec
 * `WHERE revokedAt IS NULL`, verrou de ligne Postgres) : le perdant de la
 * course concurrente obtient `count === 0` et retourne `null` SANS jamais
 * passer par la détection de vol — seule une ligne déjà révoquée AVANT cet
 * appel (`session.revokedAt` non nul dès la lecture initiale) déclenche
 * encore ce signal, exactement comme avant.
 */
export async function rotateRefreshToken(rawRefreshToken: string) {
  const hashed = hashToken(rawRefreshToken);
  const session = await prisma.session.findFirst({
    where: { refreshToken: hashed },
    include: { user: true },
  });

  // Jamais émis (ou base réinitialisée) — aucun signal à émettre.
  if (!session) return null;

  if (session.revokedAt) {
    // Déjà révoquée AVANT cet appel (pas une course avec un concurrent
    // arrivé en même temps) : réutilisation d'un refresh token déjà
    // tourné/révoqué, signal de vol.
    await revokeAllUserSessions(session.userId);
    void recordAudit({
      userId: session.userId,
      action: 'auth.refresh_reuse_detected',
      entity: 'Session',
      entityId: session.id,
      metadata: { deviceInfo: session.deviceInfo, ipAddress: session.ipAddress },
    });
    void notify({
      userId: session.userId,
      category: 'SECURITY',
      title: 'Activité suspecte détectée',
      body: 'Un identifiant de connexion déjà utilisé a été présenté à nouveau. Toutes vos sessions ont été déconnectées par précaution.',
      priority: 'CRITICAL',
    });
    return null;
  }

  if (session.expiresAt <= new Date()) return null; // expiration normale, aucun signal

  const newJti = generateSecureToken(24);
  const newRawRefreshToken = generateSecureToken(48);
  const newHashedRefreshToken = hashToken(newRawRefreshToken);
  const newAccessToken = signAccessToken({
    sub: session.userId,
    phone: session.user.phone,
    role: session.user.role,
    jti: newJti,
  });
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    // Compare-and-swap atomique : ne révoque QUE si la ligne est encore
    // active AU MOMENT DE L'ÉCRITURE (verrou de ligne Postgres), pas
    // seulement au moment de la lecture ci-dessus. Élimine la fenêtre de
    // course entre deux rotations concurrentes du même refresh token.
    const claim = await tx.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claim.count === 0) {
      // Un appel concurrent a gagné la course entre notre lecture et notre
      // écriture (pas AVANT notre lecture, sinon le `if` ci-dessus l'aurait
      // déjà détecté) : perdant légitime d'une course, PAS un vol. Aucune
      // révocation en cascade, aucun audit/alerte — le client concerné
      // devra simplement se reconnecter (le concurrent gagnant, lui,
      // détient déjà une session valide).
      return null;
    }

    await tx.session.create({
      data: {
        userId: session.userId,
        jti: newJti,
        refreshToken: newHashedRefreshToken,
        deviceInfo: session.deviceInfo,
        ipAddress: session.ipAddress,
        expiresAt,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      user: session.user,
    };
  });
}

// ---- Extract token from request ----

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

// ---- Réponse de session standard (login / verify-otp / 2fa) ----

type SessionUser = {
  id: string; phone: string; firstName: string; lastName: string;
  role: string; kycStatus: string; kycLevel: number; isPhoneVerified: boolean;
};

export async function buildSessionResponse(
  user: SessionUser,
  meta: { ipAddress?: string; deviceInfo?: string }
) {
  const session = await createSession(user.id, user.phone, user.role, meta);
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      kycStatus: user.kycStatus,
      kycLevel: user.kycLevel,
      isPhoneVerified: user.isPhoneVerified,
    },
  };
}
