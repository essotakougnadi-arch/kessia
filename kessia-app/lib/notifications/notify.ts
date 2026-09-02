// ============================================================
// KESSIA — Notifications internes (cahier des charges §7, §12, §33)
// Helper non bloquant : un échec de notification ne casse jamais
// l'action métier (comme recordAudit).
// ============================================================

import prisma from '@/lib/db/prisma';
import type { NotificationCategory, NotificationPriority } from '@prisma/client';
import { dispatch, channelsFor } from './channels';

export type NotifyInput = {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  priority?: NotificationPriority;
  actionUrl?: string;
};

// Les notifications SECURITY sont toujours délivrées (non désactivables).
const PREF_FIELD: Partial<Record<NotificationCategory, string>> = {
  PAYMENT: 'notifyPayment',
  TONTINE: 'notifyTontine',
  BUSINESS: 'notifyBusiness',
  SUPPORT: 'notifySupport',
  SYSTEM: 'notifySystem',
  PROMOTION: 'notifyPromotion',
};

/** Vrai si l'utilisateur accepte cette catégorie (SECURITY toujours vrai). */
async function accepts(userId: string, category: NotificationCategory): Promise<boolean> {
  if (category === 'SECURITY') return true;
  const field = PREF_FIELD[category];
  if (!field) return true;
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { [field]: true } as Record<string, boolean>,
    });
    if (!profile) return true; // pas de profil → défaut (activé)
    return (profile as Record<string, boolean>)[field] !== false;
  } catch {
    return true;
  }
}

/** Crée une notification pour un utilisateur. Ne lève jamais. Respecte les préférences. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    if (!(await accepts(input.userId, input.category))) return;
    const priority = input.priority ?? 'NORMAL';
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        category: input.category,
        priority,
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl,
      },
    });
    // Distribution multi-canal (§33) — non bloquante, canaux réels en simulation
    void dispatch(
      {
        userId: input.userId, notificationId: notification.id,
        category: input.category, priority, title: input.title, body: input.body, actionUrl: input.actionUrl,
      },
      channelsFor(priority)
    );
  } catch (e) {
    console.error('[NOTIFY] échec écriture', input.category, input.title, e);
  }
}

/** Crée la même notification pour plusieurs utilisateurs (dédupliqués), en respectant les préférences. */
export async function notifyMany(userIds: string[], input: Omit<NotifyInput, 'userId'>): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  try {
    const allowed = (
      await Promise.all(unique.map(async (id) => ((await accepts(id, input.category)) ? id : null)))
    ).filter((id): id is string => id !== null);
    if (allowed.length === 0) return;
    await prisma.notification.createMany({
      data: allowed.map((userId) => ({
        userId,
        category: input.category,
        priority: input.priority ?? 'NORMAL',
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl,
      })),
    });
  } catch (e) {
    console.error('[NOTIFY] échec écriture multiple', input.category, input.title, e);
  }
}
