// ============================================================
// KESSIA — GET/PATCH /api/v1/profile
// Profil complet de l'utilisateur connecté
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { recordAudit } from '@/lib/audit/audit.service';
import { MVP_USER_TYPE_KEYS } from '@/lib/user/user-type';

export const dynamic = 'force-dynamic';

const updateProfileSchema = z.object({
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  city: z.string().max(100).optional(),
  profession: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  language: z.enum(['fr', 'en']).optional(),
  userType: z.enum(MVP_USER_TYPE_KEYS).optional(),
  notifications: z
    .object({
      notifyPayment: z.boolean().optional(),
      notifyTontine: z.boolean().optional(),
      notifyBusiness: z.boolean().optional(),
      notifySupport: z.boolean().optional(),
      notifySystem: z.boolean().optional(),
      notifyPromotion: z.boolean().optional(),
    })
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      include: { profile: true },
    });

    if (!user) return notFound('Utilisateur introuvable.');

    return ok({
      id: user.id,
      phone: user.phone,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      kycStatus: user.kycStatus,
      kycLevel: user.kycLevel,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      profile: {
        avatar: user.profile?.avatar ?? null,
        profession: user.profile?.profession ?? null,
        city: user.profile?.city ?? null,
        country: user.profile?.country ?? 'TG',
        language: user.profile?.language ?? 'fr',
        bio: user.profile?.bio ?? null,
        kessiaScore: user.profile?.kessiaScore ?? 0,
        userType: user.profile?.userType ?? 'INDIVIDUAL',
        userTypeSetAt: user.profile?.userTypeSetAt ?? null,
      },
      notifications: {
        notifyPayment: user.profile?.notifyPayment ?? true,
        notifyTontine: user.profile?.notifyTontine ?? true,
        notifyBusiness: user.profile?.notifyBusiness ?? true,
        notifySupport: user.profile?.notifySupport ?? true,
        notifySystem: user.profile?.notifySystem ?? true,
        notifyPromotion: user.profile?.notifyPromotion ?? false,
      },
    });
  } catch (error) {
    logApiError('/v1/profile', error);
    return serverError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const { firstName, lastName, email, city, profession, bio, language, userType, notifications } = parsed.data;

    const userData: Record<string, unknown> = {};
    if (firstName !== undefined) userData.firstName = firstName;
    if (lastName !== undefined) userData.lastName = lastName;
    if (email !== undefined) userData.email = email === '' ? null : email;

    const profileData: Record<string, unknown> = {};
    if (city !== undefined) profileData.city = city;
    if (profession !== undefined) profileData.profession = profession;
    if (bio !== undefined) profileData.bio = bio;
    if (language !== undefined) profileData.language = language;
    if (userType !== undefined) { profileData.userType = userType; profileData.userTypeSetAt = new Date(); }
    if (notifications) {
      for (const [k, v] of Object.entries(notifications)) {
        if (v !== undefined) profileData[k] = v;
      }
    }

    const user = await prisma.user.update({
      where: { id: context.userId },
      data: {
        ...userData,
        profile: {
          upsert: {
            create: profileData,
            update: profileData,
          },
        },
      },
      include: { profile: true },
    });

    void recordAudit({
      userId: context.userId,
      action: 'profile.update',
      entity: 'User',
      entityId: context.userId,
      metadata: { fields: Object.keys({ ...userData, ...profileData }) },
      request,
    });

    return ok(
      {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profile: {
          city: user.profile?.city ?? null,
          profession: user.profile?.profession ?? null,
          bio: user.profile?.bio ?? null,
          language: user.profile?.language ?? 'fr',
        },
      },
      'Profil mis à jour.'
    );
  } catch (error) {
    logApiError('/v1/profile', error);
    return serverError();
  }
}
