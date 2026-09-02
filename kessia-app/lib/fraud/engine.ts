// ============================================================
// KESSIA — Anti-fraude : moteur (cahier des charges §32)
//
// Rassemble les signaux depuis la base, appelle les règles pures
// (lib/fraud/rules.ts), et — si le risque le justifie — crée une
// alerte (revue humaine), notifie l'utilisateur (SECURITY) et audite.
// N'interrompt JAMAIS l'action métier (appel non bloquant).
// ============================================================

import prisma from '@/lib/db/prisma';
import { assessFraud, type FraudInputs } from './rules';
import { recordDevice } from './devices';
import { KYC_LIMITS, tierFor } from '@/lib/kyc/limits';
import { recordAudit } from '@/lib/audit/audit.service';
import { notify } from '@/lib/notifications/notify';

const DAY = 86_400_000;
const HOUR = 3_600_000;

type Headersish = { get(name: string): string | null };

export type AssessEventInput = {
  userId: string;
  context: FraudInputs['context'];
  amount?: number;
  balanceBefore?: number;
  entityId?: string | null;
  request: { headers: Headersish };
  recentFailedLogins?: number;
  /** destinataire d'un transfert (active les signaux comportementaux ciblés) */
  recipientUserId?: string | null;
};

/** Évalue un évènement. Ne lève jamais. Retourne l'assessment (ou null). */
export async function assessEvent(input: AssessEventInput) {
  try {
    const now = Date.now();
    const device = await recordDevice(input.userId, input.request);

    const [user, wallet] = await Promise.all([
      prisma.user.findUnique({ where: { id: input.userId }, select: { createdAt: true, kycStatus: true, kycLevel: true } }),
      prisma.wallet.findFirst({ where: { userId: input.userId }, select: { id: true } }),
    ]);

    let outboundLast10min = 0;
    let outboundLast1h = 0;
    let distinctRecipients24h = 0;
    let maxOutbound30d = 0;
    let daysSinceLastActivity = 999;
    let inboundLast1hAmount = 0;
    let firstTransferToRecipient = false;
    let transfersNearLimit24h = 0;
    let avgDailyOutbound = 0;

    const perTxLimit = KYC_LIMITS[tierFor(user?.kycStatus ?? 'NOT_STARTED', user?.kycLevel ?? 0)].perTransaction;

    if (wallet) {
      const [recent, hour, day, month, out30dCount, last, inbound1h, priorToRecipient] = await Promise.all([
        prisma.ledgerEntry.count({
          where: { walletId: wallet.id, type: 'TRANSFER_OUT', createdAt: { gte: new Date(now - 10 * 60_000) } },
        }),
        prisma.ledgerEntry.count({
          where: { walletId: wallet.id, type: 'TRANSFER_OUT', createdAt: { gte: new Date(now - HOUR) } },
        }),
        prisma.ledgerEntry.findMany({
          where: { walletId: wallet.id, type: 'TRANSFER_OUT', createdAt: { gte: new Date(now - DAY) } },
          select: { metadata: true, amount: true },
        }),
        prisma.ledgerEntry.aggregate({
          where: { walletId: wallet.id, type: 'TRANSFER_OUT', createdAt: { gte: new Date(now - 30 * DAY) } },
          _max: { amount: true },
        }),
        prisma.ledgerEntry.count({
          where: { walletId: wallet.id, type: 'TRANSFER_OUT', createdAt: { gte: new Date(now - 30 * DAY) } },
        }),
        prisma.ledgerEntry.findFirst({
          where: { walletId: wallet.id, status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        prisma.ledgerEntry.aggregate({
          where: { walletId: wallet.id, type: 'TRANSFER_IN', createdAt: { gte: new Date(now - HOUR) } },
          _sum: { amount: true },
        }),
        input.recipientUserId
          ? prisma.ledgerEntry.count({
              where: {
                walletId: wallet.id,
                type: 'TRANSFER_OUT',
                metadata: { path: ['recipientUserId'], equals: input.recipientUserId },
              },
            })
          : Promise.resolve(-1),
      ]);
      outboundLast10min = recent;
      outboundLast1h = hour;
      const recipients = new Set(
        day.map((e) => {
          const m = e.metadata as Record<string, unknown> | null;
          return (m?.recipientUserId as string) ?? (m?.recipientPhone as string) ?? '';
        }).filter(Boolean)
      );
      distinctRecipients24h = recipients.size;
      maxOutbound30d = Number(month._max.amount ?? 0);
      avgDailyOutbound = out30dCount / 30;
      transfersNearLimit24h = day.filter((e) => Number(e.amount) >= perTxLimit * 0.8).length;
      inboundLast1hAmount = Number(inbound1h._sum.amount ?? 0);
      firstTransferToRecipient = priorToRecipient === 0;
      if (last) daysSinceLastActivity = Math.floor((now - last.createdAt.getTime()) / DAY);
    }

    const inputs: FraudInputs = {
      context: input.context,
      newDevice: device?.isNew ?? false,
      deviceTrusted: device?.trusted ?? false,
      outboundLast10min,
      outboundLast1h,
      distinctRecipients24h,
      amount: input.amount ?? 0,
      maxOutbound30d,
      balanceBefore: input.balanceBefore ?? 0,
      daysSinceLastActivity,
      recentFailedLogins: input.recentFailedLogins ?? 0,
      accountAgeDays: user ? Math.floor((now - user.createdAt.getTime()) / DAY) : 999,
      hourOfDay: new Date(now).getUTCHours(), // Togo = UTC
      inboundLast1hAmount,
      firstTransferToRecipient,
      transfersNearLimit24h,
      avgDailyOutbound,
    };

    const assessment = assessFraud(inputs);
    if (!assessment.alert) return assessment;

    // Dédoublonnage : si une alerte est déjà ouverte pour ce compte et ce
    // contexte dans la dernière heure, on l'enrichit (score max, signaux
    // fusionnés) plutôt que d'en empiler une seconde dans la file de revue.
    const openRecent = await prisma.fraudAlert.findFirst({
      where: {
        userId: input.userId,
        context: input.context,
        status: { in: ['OPEN', 'REVIEWING'] },
        createdAt: { gte: new Date(now - HOUR) },
      },
      orderBy: { createdAt: 'desc' },
    });

    let alert;
    let escalated = false;
    if (openRecent) {
      const prevSignals = Array.isArray(openRecent.signals) ? (openRecent.signals as unknown[]) : [];
      const seen = new Set(
        prevSignals.map((s) => (s && typeof s === 'object' ? (s as { type?: string }).type : undefined)).filter(Boolean)
      );
      const mergedSignals = [
        ...prevSignals,
        ...assessment.signals.filter((s) => !seen.has(s.type)),
      ];
      const nextScore = Math.max(openRecent.score, assessment.score);
      escalated = nextScore > openRecent.score;
      alert = await prisma.fraudAlert.update({
        where: { id: openRecent.id },
        data: {
          score: nextScore,
          riskLevel: nextScore >= 80 ? 'CRITICAL' : nextScore >= 55 ? 'HIGH' : nextScore >= 30 ? 'MEDIUM' : 'LOW',
          signals: mergedSignals as unknown as object,
          entityId: input.entityId ?? openRecent.entityId,
        },
      });
    } else {
      alert = await prisma.fraudAlert.create({
        data: {
          userId: input.userId,
          riskLevel: assessment.riskLevel,
          score: assessment.score,
          signals: assessment.signals as unknown as object,
          context: input.context,
          entityId: input.entityId ?? null,
        },
      });
      escalated = true;
    }

    void recordAudit({
      userId: input.userId,
      action: openRecent ? 'fraud.alert_updated' : 'fraud.alert_raised',
      entity: 'FraudAlert',
      entityId: alert.id,
      metadata: { context: input.context, score: alert.score, riskLevel: alert.riskLevel },
      request: input.request,
    });

    if (escalated && (assessment.riskLevel === 'HIGH' || assessment.riskLevel === 'CRITICAL')) {
      void notify({
        userId: input.userId,
        category: 'SECURITY',
        priority: 'HIGH',
        title: 'Activité inhabituelle détectée',
        body: 'Une opération sur votre compte a déclenché une vérification de sécurité. Si ce n’était pas vous, changez votre mot de passe et contactez le support.',
        actionUrl: '/profile/security',
      });
    }

    return assessment;
  } catch (e) {
    console.error('[FRAUD] assessEvent', e);
    return null;
  }
}
