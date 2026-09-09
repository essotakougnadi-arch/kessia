// ============================================================
// KESSIA — Effacement des données d'un compte (RGPD art. 17)
//
// Encadré et déclenché à la main par un rôle conformité, une fois la
// demande de suppression instruite. On distingue :
//
//  • PURGE   — données purement personnelles sans obligation de
//              conservation : documents KYC (bucket + lignes),
//              conversations IA, notifications, empreintes d'appareil,
//              état du plan de croissance, corps des messages support.
//  • ANONYME — la ligne `User` et son profil restent (intégrité
//              référentielle des écritures financières) mais toute
//              donnée identifiante est effacée.
//  • CONSERVÉ — grand livre / transactions (obligation comptable),
//              journal d'audit (5 ans), métadonnées KYC sans pièces
//              (preuve LCB-FT). Voir docs/compliance/matrix.md §9.
// ============================================================

import prisma from '@/lib/db/prisma';
import { removeKycDocuments } from '@/lib/storage/kyc-storage';
import { removeTicketAttachments } from '@/lib/storage/ticket-storage';

export type ErasureResult = {
  userId: string;
  kycDocuments: number;
  ticketAttachments: number;
  aiMessages: number;
  notifications: number;
  devices: number;
  growthSteps: number;
  anonymized: boolean;
};

const TOMBSTONE = 'Compte supprimé';

export async function eraseUserData(userId: string): Promise<ErasureResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      kycCases: { select: { documents: { select: { id: true, storageKey: true } } } },
      supportTickets: { select: { attachments: { select: { storageKey: true } } } },
    },
  });
  if (!user) throw new Error('Utilisateur introuvable.');

  // ── 1. Purge du stockage objet ──────────────────────────────
  const kycKeys = user.kycCases.flatMap((c) => c.documents.map((d) => d.storageKey));
  const ticketKeys = user.supportTickets.flatMap((t) => t.attachments.map((a) => a.storageKey));
  await Promise.all([
    removeKycDocuments(kycKeys).catch(() => {}),
    removeTicketAttachments(ticketKeys).catch(() => {}),
  ]);

  // ── 2. Purge des lignes personnelles + anonymisation ────────
  const [kycDocuments, aiMessages, notifications, devices, growthSteps] = await prisma.$transaction([
    prisma.kycDocument.deleteMany({ where: { kycCase: { userId } } }),
    prisma.aiMessage.deleteMany({ where: { conversation: { userId } } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.device.deleteMany({ where: { userId } }),
    prisma.growthStepState.deleteMany({ where: { userId } }),
    prisma.aiConversation.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.otpCode.deleteMany({ where: { userId } }),
    // Métadonnées KYC : on garde le dossier (preuve LCB-FT) mais on
    // efface les notes qui pourraient contenir des données perso.
    prisma.kycCase.updateMany({ where: { userId }, data: { rejectionReason: null } }),
    // Support : on garde les tickets (traçabilité) mais on neutralise
    // le contenu libre.
    prisma.ticketMessage.updateMany({
      where: { ticket: { userId } },
      data: { content: '[contenu effacé]' },
    }),
    prisma.ticketAttachment.deleteMany({ where: { ticket: { userId } } }),
    prisma.supportTicket.updateMany({
      where: { userId },
      data: { subject: '[ticket d’un compte supprimé]' },
    }),
    // Profil : toute donnée identifiante.
    prisma.userProfile.updateMany({
      where: { userId },
      data: { avatar: null, bio: null, city: null, profession: null },
    }),
    // Compte : pierre tombale. Le téléphone doit rester unique.
    prisma.user.update({
      where: { id: userId },
      data: {
        firstName: TOMBSTONE,
        lastName: '',
        phone: `deleted:${userId}`,
        email: null,
        passwordHash: null,
        isActive: false,
        isPhoneVerified: false,
        isEmailVerified: false,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackup: [],
        pinHash: null,
        pinEnabled: false,
        dataExportRequestedAt: null,
      },
    }),
  ]);

  return {
    userId,
    kycDocuments: kycDocuments.count,
    ticketAttachments: ticketKeys.length,
    aiMessages: aiMessages.count,
    notifications: notifications.count,
    devices: devices.count,
    growthSteps: growthSteps.count,
    anonymized: true,
  };
}
