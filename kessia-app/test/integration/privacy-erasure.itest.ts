// ============================================================
// KESSIA — Effacement RGPD (art. 17) + purge de rétention (§9)
//
// Vérifie contre une vraie base :
//  • eraseUserData() purge les pièces KYC / IA / notifs / appareils,
//    neutralise le support, et anonymise la ligne User + le profil,
//    sans casser l'intégrité référentielle (ledger conservé).
//  • runRetentionPurge() supprime les OTP, sessions et notifications
//    lues au-delà de la fenêtre, et laisse le reste intact.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import prisma from '@/lib/db/prisma';
import { eraseUserData } from '@/lib/privacy/erasure';
import { runRetentionPurge, RETENTION_DAYS } from '@/lib/privacy/retention';
import { makeUser, cleanup, settle, tag } from './helpers';

const DAY = 86_400_000;
const userIds: string[] = [];

afterEach(async () => {
  await settle();
  // Les tickets restent après effacement (traçabilité) : purge explicite.
  for (const id of userIds) {
    await prisma.ticketMessage.deleteMany({ where: { ticket: { userId: id } } }).catch(() => {});
    await prisma.ticketAttachment.deleteMany({ where: { ticket: { userId: id } } }).catch(() => {});
    await prisma.supportTicket.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.kycDocument.deleteMany({ where: { kycCase: { userId: id } } }).catch(() => {});
    await prisma.kycCase.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.aiMessage.deleteMany({ where: { conversation: { userId: id } } }).catch(() => {});
    await prisma.aiConversation.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.device.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.growthStepState.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.session.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.userProfile.deleteMany({ where: { userId: id } }).catch(() => {});
  }
  await cleanup({ userIds: userIds.splice(0) });
});

describe('eraseUserData — effacement RGPD encadré (intégration)', () => {
  it('purge les données personnelles et anonymise le compte', async () => {
    const u = await makeUser({ balance: 5000 });
    userIds.push(u.id);
    const t = tag();

    await prisma.user.update({
      where: { id: u.id },
      data: {
        email: `${t}@example.test`,
        firstName: 'Ama',
        lastName: 'Koffi',
        pinHash: 'x',
        pinEnabled: true,
        deletionRequestedAt: new Date(),
        profile: {
          create: { avatar: 'data:image/png;base64,AAAA', bio: 'Bonjour', city: 'Lomé', profession: 'Couturière' },
        },
      },
    });

    const kyc = await prisma.kycCase.create({
      data: { userId: u.id, status: 'IN_PROGRESS', level: 1, rejectionReason: 'flou' },
    });
    await prisma.kycDocument.create({
      data: { kycCaseId: kyc.id, type: 'NATIONAL_ID', fileUrl: 'data:x', storageKey: `kyc/${u.id}/id.jpg` },
    });

    const conv = await prisma.aiConversation.create({ data: { userId: u.id, context: 'GENERAL' } });
    await prisma.aiMessage.create({ data: { conversationId: conv.id, role: 'USER', content: 'mon secret' } });

    await prisma.notification.create({
      data: { userId: u.id, category: 'SYSTEM', title: 'Coucou', body: 'corps' },
    });
    await prisma.device.create({ data: { userId: u.id, fingerprint: 'fp-1', userAgent: 'UA' } });
    await prisma.growthStepState.create({ data: { userId: u.id, stepKey: 'open_wallet', status: 'DONE' } });

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber: `IT-${t}`,
        userId: u.id,
        category: 'ACCOUNT',
        subject: 'Mon vrai nom dans le sujet',
        description: 'détails privés',
      },
    });
    await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, authorId: u.id, content: 'coordonnées bancaires' },
    });
    await prisma.ticketAttachment.create({
      data: {
        ticketId: ticket.id,
        uploadedById: u.id,
        fileName: 'piece.jpg',
        mimeType: 'image/jpeg',
        size: 1234,
        storageKey: `tickets/${ticket.id}/piece.jpg`,
      },
    });

    const res = await eraseUserData(u.id);

    expect(res.anonymized).toBe(true);
    expect(res.kycDocuments).toBe(1);
    expect(res.aiMessages).toBe(1);
    expect(res.notifications).toBe(1);
    expect(res.devices).toBe(1);
    expect(res.growthSteps).toBe(1);
    expect(res.ticketAttachments).toBe(1);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      include: { profile: true },
    });
    expect(after.firstName).toBe('Compte supprimé');
    expect(after.lastName).toBe('');
    expect(after.email).toBeNull();
    expect(after.passwordHash).toBeNull();
    expect(after.phone.startsWith('deleted:')).toBe(true);
    expect(after.isActive).toBe(false);
    expect(after.pinEnabled).toBe(false);
    expect(after.pinHash).toBeNull();
    expect(after.profile?.avatar).toBeNull();
    expect(after.profile?.bio).toBeNull();
    expect(after.profile?.city).toBeNull();

    // Purge effective
    expect(await prisma.kycDocument.count({ where: { kycCase: { userId: u.id } } })).toBe(0);
    expect(await prisma.aiMessage.count({ where: { conversation: { userId: u.id } } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.device.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.ticketAttachment.count({ where: { ticket: { userId: u.id } } })).toBe(0);

    // Traçabilité conservée mais neutralisée
    const kycAfter = await prisma.kycCase.findFirstOrThrow({ where: { userId: u.id } });
    expect(kycAfter.rejectionReason).toBeNull();
    const ticketAfter = await prisma.supportTicket.findFirstOrThrow({ where: { userId: u.id } });
    expect(ticketAfter.subject).not.toContain('vrai nom');
    const msgAfter = await prisma.ticketMessage.findFirstOrThrow({ where: { ticketId: ticket.id } });
    expect(msgAfter.content).toBe('[contenu effacé]');
  });

  it('échoue proprement pour un compte inexistant', async () => {
    await expect(eraseUserData('user_inexistant_xyz')).rejects.toThrow(/introuvable/i);
  });
});

describe('runRetentionPurge — purge programmée (intégration)', () => {
  it('supprime les données techniques au-delà de la fenêtre, garde le reste', async () => {
    const u = await makeUser();
    userIds.push(u.id);
    const now = Date.now();
    const old = new Date(now - (RETENTION_DAYS.otp + 5) * DAY);
    const fresh = new Date(now - 60_000);

    const oldOtp = await prisma.otpCode.create({
      data: { userId: u.id, phone: u.phone, code: '000000', purpose: 'LOGIN', expiresAt: old },
    });
    const freshOtp = await prisma.otpCode.create({
      data: { userId: u.id, phone: u.phone, code: '111111', purpose: 'LOGIN', expiresAt: fresh },
    });
    const oldReadNotif = await prisma.notification.create({
      data: { userId: u.id, category: 'SYSTEM', title: 'vieux', body: 'x', isRead: true },
    });
    await prisma.notification.update({
      where: { id: oldReadNotif.id },
      data: { createdAt: new Date(now - (RETENTION_DAYS.notificationRead + 10) * DAY) },
    });
    const unreadOldNotif = await prisma.notification.create({
      data: { userId: u.id, category: 'SYSTEM', title: 'non lu', body: 'x', isRead: false },
    });
    await prisma.notification.update({
      where: { id: unreadOldNotif.id },
      data: { createdAt: new Date(now - (RETENTION_DAYS.notificationRead + 10) * DAY) },
    });

    const result = await runRetentionPurge(now);

    expect(result.otps).toBeGreaterThanOrEqual(1);
    expect(await prisma.otpCode.findUnique({ where: { id: oldOtp.id } })).toBeNull();
    expect(await prisma.otpCode.findUnique({ where: { id: freshOtp.id } })).not.toBeNull();
    expect(await prisma.notification.findUnique({ where: { id: oldReadNotif.id } })).toBeNull();
    // Une notification NON LUE n'est jamais purgée par la rétention.
    expect(await prisma.notification.findUnique({ where: { id: unreadOldNotif.id } })).not.toBeNull();

    // nettoyage local
    await prisma.otpCode.deleteMany({ where: { userId: u.id } });
    await prisma.notification.deleteMany({ where: { userId: u.id } });
  });
});
