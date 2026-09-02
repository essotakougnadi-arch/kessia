// ============================================================
// KESSIA — Utilitaires Crypto & Sécurité
// ============================================================

import crypto from 'crypto';

// ---- OTP ----

/**
 * Génère un OTP numérique à N chiffres (défaut: 6)
 */
export function generateOtp(length = 6): string {
  const max = Math.pow(10, length);
  const min = Math.pow(10, length - 1);
  const range = max - min;
  const randomBytes = crypto.randomBytes(4);
  const randomInt = randomBytes.readUInt32BE(0);
  return String(min + (randomInt % range));
}

/**
 * Calcule la date d'expiration d'un OTP
 */
export function otpExpiresAt(minutes = 10): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

// ---- Tokens ----

/**
 * Génère un token aléatoire sécurisé (hex)
 */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Génère un UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID();
}

// ---- Invite codes ----

/**
 * Génère un code d'invitation court pour les tontines (ex: KESS-A1B2)
 */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KESS-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ---- Idempotency ----

/**
 * Génère une clé d'idempotence pour les transactions ledger
 */
export function generateIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

// ---- Hashing ----

/**
 * Hash un token pour comparaison sécurisée (ex: refresh token stocké)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ---- Timing-safe comparison ----

/**
 * Comparaison sécurisée pour éviter les timing attacks
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---- Phone normalization ----

/**
 * Normalise un numéro de téléphone togolais (supprime espaces, tirets)
 */
export function normalizePhone(phone: string, countryCode = '+228'): string {
  let normalized = phone.replace(/[\s\-\(\)\.]/g, '');
  if (normalized.startsWith('00')) {
    normalized = '+' + normalized.slice(2);
  }
  if (!normalized.startsWith('+')) {
    normalized = countryCode + normalized;
  }
  return normalized;
}
