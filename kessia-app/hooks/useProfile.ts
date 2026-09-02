// ============================================================
// KESSIA — useProfile / useKyc Hooks
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend, type ApiResult } from '@/lib/api/client';
import type { KycStatus, UserType } from '@prisma/client';

export type Profile = {
  id: string;
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  kycStatus: KycStatus;
  kycLevel: number;
  createdAt: string;
  lastLoginAt: string | null;
  profile: {
    avatar: string | null;
    profession: string | null;
    city: string | null;
    country: string;
    language: string;
    bio: string | null;
    kessiaScore: number;
    userType: UserType;
    userTypeSetAt: string | null;
  };
  notifications: NotificationPrefs;
};

export type NotificationPrefs = {
  notifyPayment: boolean;
  notifyTontine: boolean;
  notifyBusiness: boolean;
  notifySupport: boolean;
  notifySystem: boolean;
  notifyPromotion: boolean;
};

export type ActionResult = { success: boolean; message: string };

function toActionResult(r: ApiResult): ActionResult {
  return {
    success: r.success,
    message: r.message ?? r.error ?? (r.success ? 'Opération réussie.' : 'Une erreur est survenue.'),
  };
}

export function useProfile() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const updateUser = useAuthStore((s) => s.updateUser);

  const { data, error, isLoading, mutate } = useSWR<Profile>(
    accessToken ? ['/api/v1/profile', accessToken] : null,
    ([url]: [string, string]) => apiGet<Profile>(url),
    { revalidateOnFocus: false }
  );

  async function updateProfile(payload: {
    firstName?: string;
    lastName?: string;
    email?: string;
    city?: string;
    profession?: string;
    bio?: string;
    language?: 'fr' | 'en';
    userType?: UserType;
    notifications?: Partial<NotificationPrefs>;
  }): Promise<ActionResult> {
    const result = toActionResult(await apiSend('/api/v1/profile', 'PATCH', payload));
    if (result.success) {
      mutate();
      if (payload.firstName || payload.lastName) {
        updateUser({
          ...(payload.firstName ? { firstName: payload.firstName } : {}),
          ...(payload.lastName ? { lastName: payload.lastName } : {}),
        });
      }
    }
    return result;
  }

  return {
    profile: data ?? null,
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    updateProfile,
  };
}

// ── KYC ─────────────────────────────────────────────────────

export type KycDocType =
  | 'NATIONAL_ID' | 'PASSPORT' | 'DRIVER_LICENSE' | 'RESIDENCE_PERMIT' | 'SELFIE' | 'PROOF_OF_ADDRESS';

export type KycDoc = { id: string; type: KycDocType; status: string; uploadedAt: string };

export type KycInfo = {
  kycStatus: KycStatus;
  kycLevel: number;
  activeCase: {
    id: string;
    status: string;
    level: number;
    rejectionReason: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    documents: KycDoc[];
  } | null;
  requirements: { level1: string[]; level2: string[]; level3: string[] };
};

export function useKyc() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<KycInfo>(
    accessToken ? ['/api/v1/kyc', accessToken] : null,
    ([url]: [string, string]) => apiGet<KycInfo>(url),
    { revalidateOnFocus: false }
  );

  async function startKyc(): Promise<ActionResult> {
    const result = toActionResult(await apiSend('/api/v1/kyc', 'POST'));
    if (result.success) mutate();
    return result;
  }

  async function submitDocument(type: KycDocType, dataUrl: string): Promise<ActionResult> {
    const result = toActionResult(
      await apiSend('/api/v1/kyc/documents', 'POST', { type, dataUrl })
    );
    if (result.success) mutate();
    return result;
  }

  return {
    kyc: data ?? null,
    documents: data?.activeCase?.documents ?? [],
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
    startKyc,
    submitDocument,
  };
}
