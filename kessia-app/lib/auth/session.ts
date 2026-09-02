// ============================================================
// KESSIA — JWT Session Management
// Access token (15min) + Refresh token (30j)
// ============================================================

import jwt from 'jsonwebtoken';
import { generateSecureToken, hashToken } from '../utils/crypto';
import prisma from '../db/prisma';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '30d';

export type JwtPayload = {
  sub: string;       // userId
  phone: string;
  role: string;
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

export async function createSession(
  userId: string,
  phone: string,
  role: string,
  meta?: { deviceInfo?: string; ipAddress?: string }
) {
  const accessToken = signAccessToken({ sub: userId, phone, role });
  const rawRefreshToken = generateSecureToken(48);
  const hashedRefreshToken = hashToken(rawRefreshToken);

  // Expiry = 30 jours
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      token: accessToken,
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

export async function revokeSession(accessToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token: accessToken } });
}

// ---- Rotate refresh token ----

export async function rotateRefreshToken(rawRefreshToken: string) {
  const hashed = hashToken(rawRefreshToken);
  const session = await prisma.session.findFirst({
    where: { refreshToken: hashed, expiresAt: { gt: new Date() } },
    include: { user: true },
  });

  if (!session) return null;

  // Génère un nouveau refresh token
  const newRawRefreshToken = generateSecureToken(48);
  const newHashedRefreshToken = hashToken(newRawRefreshToken);
  const newAccessToken = signAccessToken({
    sub: session.userId,
    phone: session.user.phone,
    role: session.user.role,
  });

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.session.update({
    where: { id: session.id },
    data: {
      token: newAccessToken,
      refreshToken: newHashedRefreshToken,
      expiresAt,
      lastUsedAt: new Date(),
    },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRawRefreshToken,
    user: session.user,
  };
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
