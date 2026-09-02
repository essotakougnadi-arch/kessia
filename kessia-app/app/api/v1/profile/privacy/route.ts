// ============================================================
// KESSIA — GET/POST /api/v1/profile/privacy
// Droits RGPD / « privacy by design » (cahier des charges §4.5, §59).
//   GET  → statut des demandes + aperçu des consentements
//   POST { action: 'export' }          → archive JSON des données + horodate la demande
//   POST { action: 'delete-request' }  → enregistre une demande de suppression
//   POST { action: 'cancel-delete' }   → annule une demande de suppression en attente
//
// NB : l'effacement effectif reste manuel/encadré — obligations légales de
// conservation (AML, comptable). Voir docs/compliance/matrix.md §9.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, badRequest, notFound, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  action: z.enum(['export', 'delete-request', 'cancel-delete']),
  reason: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: {
        dataExportRequestedAt: true,
        deletionRequestedAt: true,
        createdAt: true,
        isEmailVerified: true,
        email: true,
      },
    });
    if (!user) return notFound('Utilisateur introuvable.');

    return ok({
      dataExportRequestedAt: user.dataExportRequestedAt,
      deletionRequestedAt: user.deletionRequestedAt,
      accountCreatedAt: user.createdAt,
      // Consentements recueillis à l'inscription (tracés dans audit_logs)
      consents: [
        { key: 'terms', label: "Conditions générales d'utilisation", grantedAt: user.createdAt },
        { key: 'data', label: 'Politique de confidentialité', grantedAt: user.createdAt },
      ],
      // Ce que l'export contient (transparence)
      exportIncludes: [
        'Identité et profil',
        'Wallet et écritures (ledger)',
        'Transactions de paiement',
        'Tontines et cotisations',
        'Activités Business',
        'Dossiers KYC (métadonnées, hors pièces jointes)',
        'Notifications et tickets de support',
      ],
    });
  } catch (e) {
    logApiError('/v1/profile/privacy', e);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'profile.privacy', {
      limit: 5, windowMs: 15 * 60_000, by: context.userId,
    });
    if (limited) return limited;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { action, reason } = parsed.data;

    if (action === 'export') {
      const archive = await buildExportArchive(context.userId);
      if (!archive) return notFound('Utilisateur introuvable.');

      await prisma.user.update({
        where: { id: context.userId },
        data: { dataExportRequestedAt: new Date() },
      });
      void recordAudit({
        userId: context.userId,
        action: 'privacy.data_export',
        entity: 'User',
        entityId: context.userId,
        request,
      });

      return ok(
        { generatedAt: new Date().toISOString(), archive },
        'Archive de vos données générée.'
      );
    }

    if (action === 'delete-request') {
      const user = await prisma.user.findUnique({
        where: { id: context.userId },
        select: { deletionRequestedAt: true },
      });
      if (!user) return notFound('Utilisateur introuvable.');
      if (user.deletionRequestedAt) {
        return badRequest('Une demande de suppression est déjà en cours de traitement.');
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: context.userId },
          data: { deletionRequestedAt: new Date() },
        }),
        prisma.notification.create({
          data: {
            userId: context.userId,
            category: 'SECURITY',
            priority: 'HIGH',
            title: 'Demande de suppression enregistrée',
            body:
              "Votre demande de suppression de compte a bien été reçue. Notre équipe la traite sous 30 jours, dans le respect des obligations légales de conservation. Vous pouvez l'annuler tant qu'elle n'est pas finalisée.",
          },
        }),
      ]);
      void recordAudit({
        userId: context.userId,
        action: 'privacy.deletion_request',
        entity: 'User',
        entityId: context.userId,
        metadata: reason ? { reason } : undefined,
        request,
      });

      return ok(
        { deletionRequestedAt: new Date().toISOString() },
        'Demande de suppression enregistrée. Traitement sous 30 jours.'
      );
    }

    // cancel-delete
    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: { deletionRequestedAt: true },
    });
    if (!user) return notFound('Utilisateur introuvable.');
    if (!user.deletionRequestedAt) {
      return badRequest('Aucune demande de suppression à annuler.');
    }

    await prisma.user.update({
      where: { id: context.userId },
      data: { deletionRequestedAt: null },
    });
    void recordAudit({
      userId: context.userId,
      action: 'privacy.deletion_cancelled',
      entity: 'User',
      entityId: context.userId,
      request,
    });

    return ok({ deletionRequestedAt: null }, 'Demande de suppression annulée.');
  } catch (e) {
    logApiError('/v1/profile/privacy', e);
    return serverError();
  }
}

// ------------------------------------------------------------
// Assemble une archive portable des données de l'utilisateur.
// Petit volume en MVP → génération synchrone. En production,
// déléguer à un job asynchrone + fichier signé (voir matrix.md §2).
// Les pièces jointes KYC (data-URI) sont exclues volontairement.
// ------------------------------------------------------------
async function buildExportArchive(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      wallet: { include: { entries: { orderBy: { createdAt: 'asc' } } } },
      paymentTransactions: { orderBy: { createdAt: 'asc' } },
      tontineMembers: { include: { tontine: { select: { name: true, status: true, amount: true, frequency: true } } } },
      businesses: { select: { id: true, name: true, sector: true, createdAt: true } },
      kycCases: { select: { id: true, status: true, level: true, createdAt: true, reviewedAt: true, rejectionReason: true } },
      notifications: { orderBy: { createdAt: 'desc' }, take: 500 },
      supportTickets: { select: { id: true, ticketNumber: true, subject: true, status: true, createdAt: true } },
    },
  });
  if (!user) return null;

  const strip = <T extends Record<string, unknown>>(obj: T, keys: string[]) => {
    const copy: Record<string, unknown> = { ...obj };
    for (const k of keys) delete copy[k];
    return copy;
  };

  return {
    identity: {
      id: user.id,
      phone: user.phone,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      kycStatus: user.kycStatus,
      kycLevel: user.kycLevel,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      twoFactorEnabled: user.twoFactorEnabled,
    },
    profile: user.profile
      ? strip(user.profile as unknown as Record<string, unknown>, ['id', 'userId'])
      : null,
    wallet: user.wallet
      ? {
          balance: Number(user.wallet.balance),
          currency: user.wallet.currency,
          ledgerEntries: user.wallet.entries.map((e) => ({
            ...strip(e as unknown as Record<string, unknown>, ['walletId']),
            amount: Number(e.amount),
            balanceBefore: Number(e.balanceBefore),
            balanceAfter: Number(e.balanceAfter),
          })),
        }
      : null,
    paymentTransactions: user.paymentTransactions.map((p) => ({
      ...strip(p as unknown as Record<string, unknown>, ['userId', 'walletId']),
      amount: Number(p.amount),
    })),
    tontines: user.tontineMembers.map((m) => ({
      status: m.status,
      orderPosition: m.orderPosition,
      totalContributed: Number(m.totalContributed),
      totalReceived: Number(m.totalReceived),
      joinedAt: m.joinedAt,
      tontine: { ...m.tontine, amount: Number(m.tontine.amount) },
    })),
    businesses: user.businesses,
    kycCases: user.kycCases,
    notifications: user.notifications.map((n) =>
      strip(n as unknown as Record<string, unknown>, ['userId'])
    ),
    supportTickets: user.supportTickets,
  };
}
