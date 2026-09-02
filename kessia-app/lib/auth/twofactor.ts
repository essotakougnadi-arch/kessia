// ============================================================
// KESSIA — MFA / TOTP (cahier des charges §31)
// ============================================================

import { authenticator } from 'otplib';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET!;

authenticator.options = { window: 1 }; // tolère ±30 s

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpAuthUri(secret: string, account: string): string {
  return authenticator.keyuri(account, 'KESSIA', secret);
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token: token.replace(/\s/g, ''), secret });
  } catch {
    return false;
  }
}

// ── Codes de secours (hashés en base) ──────────────────────

export function generateBackupCodes(count = 8): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 hex
    plain.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    hashed.push(hashBackup(code));
  }
  return { plain, hashed };
}

export function hashBackup(code: string): string {
  return crypto.createHash('sha256').update(code.replace(/[-\s]/g, '').toUpperCase()).digest('hex');
}

/** Renvoie les codes restants après consommation, ou null si le code est invalide. */
export function consumeBackupCode(stored: string[], input: string): string[] | null {
  const h = hashBackup(input);
  if (!stored.includes(h)) return null;
  return stored.filter((c) => c !== h);
}

// ── Jeton de défi 2FA (entre login et /2fa/verify) ─────────

export function issue2faChallenge(userId: string): string {
  return jwt.sign({ sub: userId, twofa: true }, JWT_SECRET, { expiresIn: '5m' });
}

export function verify2faChallenge(token: string): { sub: string } | null {
  try {
    const p = jwt.verify(token, JWT_SECRET) as { sub: string; twofa?: boolean };
    return p.twofa ? { sub: p.sub } : null;
  } catch {
    return null;
  }
}
