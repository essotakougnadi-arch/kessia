// ============================================================
// KESSIA — Schémas de validation Zod (Auth)
// ============================================================

import { z } from 'zod';

// ---- Helpers ----

const phoneSchema = z
  .string()
  .min(8, 'Numéro de téléphone trop court')
  .max(20, 'Numéro de téléphone trop long')
  .regex(/^[\+\d\s\-\(\)]+$/, 'Format de numéro invalide');

const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(128, 'Mot de passe trop long')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre');

// ---- Register ----

export const registerSchema = z.object({
  phone: phoneSchema,
  firstName: z
    .string()
    .min(2, 'Le prénom doit contenir au moins 2 caractères')
    .max(50, 'Prénom trop long')
    .regex(/^[\p{L}\s\-']+$/u, 'Prénom invalide'),
  lastName: z
    .string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(50, 'Nom trop long')
    .regex(/^[\p{L}\s\-']+$/u, 'Nom invalide'),
  password: passwordSchema,
  // Profil déclaratif (§4). Facultatif à l'inscription, complétable ensuite.
  userType: z
    .enum(['INDIVIDUAL', 'BEGINNER_ENTREPRENEUR', 'MICRO_ENTERPRISE', 'SME', 'COOPERATIVE'])
    .optional(),
  consentTerms: z.literal(true, {
    errorMap: () => ({ message: 'Vous devez accepter les conditions d\'utilisation' }),
  }),
  consentData: z.literal(true, {
    errorMap: () => ({ message: 'Vous devez accepter la politique de confidentialité' }),
  }),
  // Version des documents juridiques acceptée (§8). Le serveur retombe
  // sur la version en vigueur si le client ne la transmet pas.
  termsVersion: z.string().max(20).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ---- Verify OTP ----

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .length(6, 'Le code OTP doit contenir 6 chiffres')
    .regex(/^\d+$/, 'Le code OTP doit être numérique'),
  purpose: z.enum(['REGISTER', 'LOGIN', 'RESET', 'VERIFY']),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

// ---- Login ----

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Mot de passe requis'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ---- Request OTP ----

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['REGISTER', 'LOGIN', 'RESET', 'VERIFY']),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

// ---- Refresh token ----

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
