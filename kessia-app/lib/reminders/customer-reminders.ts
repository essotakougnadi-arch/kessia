// ============================================================
// KESSIA — Relances clients automatiques (cahier des charges §7, §33)
//
// À chaque passage de l'ordonnanceur, notifie l'exploitant des
// relances client échues (`Customer.nextFollowUpAt <= now`), une
// seule fois par échéance (`followUpNotifiedAt`).
// ============================================================

import prisma from '@/lib/db/prisma';
import { notify } from '@/lib/notifications/notify';
import { SEGMENT_LABEL, customerSegment } from '@/lib/business/crm';

/** PUR : une relance est due si l'échéance est passée et n'a pas encore été notifiée. */
export function isReminderDue(
  nextFollowUpAt: Date | null,
  followUpNotifiedAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!nextFollowUpAt) return false;
  if (nextFollowUpAt.getTime() > now.getTime()) return false;
  if (!followUpNotifiedAt) return true;
  return followUpNotifiedAt.getTime() < nextFollowUpAt.getTime();
}

export type ReminderRun = { checked: number; notified: number };

export async function runCustomerReminders(now: Date = new Date()): Promise<ReminderRun> {
  const candidates = await prisma.customer.findMany({
    where: { nextFollowUpAt: { lte: now } },
    select: {
      id: true, name: true, type: true, followUpNote: true, nextFollowUpAt: true, followUpNotifiedAt: true,
      business: { select: { id: true, name: true, userId: true } },
      sales: { select: { createdAt: true } },
    },
    take: 500,
  });
  const due = candidates.filter((c) => isReminderDue(c.nextFollowUpAt, c.followUpNotifiedAt, now));

  let notified = 0;
  for (const c of due) {
    const lastOrderAt = c.sales.reduce<Date | null>((l, s) => (!l || s.createdAt > l ? s.createdAt : l), null);
    const segment = customerSegment({ type: c.type, orderCount: c.sales.length, lastOrderAt, now });

    await notify({
      userId: c.business.userId,
      category: 'BUSINESS',
      priority: 'NORMAL',
      title: `Relance prévue — ${c.name}`,
      body: `${c.business.name} · ${SEGMENT_LABEL[segment]}. ${c.followUpNote?.trim() || 'Recontactez ce client aujourd’hui.'}`,
      actionUrl: `/business/${c.business.id}?tab=clients`,
    });
    await prisma.customer.update({
      where: { id: c.id },
      data: { followUpNotifiedAt: now },
    });
    notified++;
  }

  return { checked: due.length, notified };
}
