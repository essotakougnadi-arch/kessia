// ============================================================
// KESSIA — GET /api/v1/trust  (cahier des charges §21 — Trust Center)
// Espace de transparence centralisé : tarifs, plafonds KYC, droits
// sur les données, sécurité du compte, Fonds de Garantie, mentions
// réglementaires. Agrège des infos déjà exposées ailleurs.
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { feeLines } from '@/lib/fees';
import { serverT } from '@/lib/i18n/server';
import { LEGAL_VERSION, LEGAL_VERSION_LABEL, isTermsUpToDate } from '@/lib/legal/versions';
import { KYC_LIMITS, tierFor, checkOutboundLimit, type KycTier } from '@/lib/kyc/limits';
import { getFundProjection } from '@/lib/guarantee/guarantee.service';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const [user, sessions, fund] = await Promise.all([
      prisma.user.findUnique({
        where: { id: context.userId },
        select: {
          kycStatus: true, kycLevel: true, twoFactorEnabled: true,
          dataExportRequestedAt: true, deletionRequestedAt: true,
          termsAcceptedVersion: true, termsAcceptedAt: true,
        },
      }),
      prisma.session.count({ where: { userId: context.userId, expiresAt: { gt: new Date() } } }),
      getFundProjection().catch(() => null),
    ]);

    const tier = tierFor(user?.kycStatus ?? 'NOT_STARTED', user?.kycLevel ?? 0);
    const limitState = await checkOutboundLimit(context.userId, 0).catch(() => null);
    const t = serverT();
    const localizedTier = (n: KycTier) => ({ ...KYC_LIMITS[n], label: t(`srvTrust.kycTier.${n}`) });

    return ok({
      fees: feeLines(t),
      kyc: {
        status: user?.kycStatus ?? 'NOT_STARTED',
        level: user?.kycLevel ?? 0,
        tier,
        limits: localizedTier(tier),
        allTiers: [localizedTier(0), localizedTier(1), localizedTier(2)],
        usedThisMonth: limitState?.usedThisMonth ?? 0,
        remainingThisMonth: limitState?.remainingThisMonth ?? KYC_LIMITS[tier].monthlyOutbound,
      },
      dataRights: {
        exportRequestedAt: user?.dataExportRequestedAt ?? null,
        deletionRequestedAt: user?.deletionRequestedAt ?? null,
        manageUrl: '/profile/privacy',
      },
      legal: {
        acceptedVersion: user?.termsAcceptedVersion ?? null,
        acceptedAt: user?.termsAcceptedAt ?? null,
        currentVersion: LEGAL_VERSION,
        currentVersionLabel: LEGAL_VERSION_LABEL,
        upToDate: isTermsUpToDate(user?.termsAcceptedVersion),
      },
      security: {
        twoFactorEnabled: !!user?.twoFactorEnabled,
        activeSessions: sessions,
        manageUrl: '/profile/security',
      },
      guaranteeFund: fund
        ? { mode: 'SIMULATION' as const, projectedBalance: fund.projectedBalance, note: t('srvTrust.guaranteeNote') }
        : { mode: 'SIMULATION' as const, projectedBalance: 0, note: t('srvTrust.guaranteeNoteShort') },
      disclaimers: [
        t('srvTrust.disclaimer1'),
        t('srvTrust.disclaimer2'),
        t('srvTrust.disclaimer3'),
        t('srvTrust.disclaimer4'),
        t('srvTrust.disclaimer5'),
      ],
    });
  } catch (e) {
    logApiError('/v1/trust', e);
    return serverError();
  }
}
