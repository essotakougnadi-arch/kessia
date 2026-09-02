// ============================================================
// KESSIA — Distribution des notifications par canal (§33)
//
// Abstraction analogue à PaymentProvider (ADR 0005) : l'app parle
// à une interface, les canaux réels (push/SMS/email) restent en
// SIMULATION tant qu'aucun fournisseur n'est branché. Chaque
// tentative est journalisée (NotificationDelivery).
//
// Pour brancher un vrai canal : implémenter un adaptateur ici et
// renseigner la variable d'environnement correspondante. Aucune
// donnée sensible n'est envoyée (titre + corps déjà destinés à
// l'utilisateur).
// ============================================================

import prisma from '@/lib/db/prisma';
import { hashToken } from '@/lib/utils/crypto';
import type { NotificationChannel, NotificationPriority, NotificationCategory } from '@prisma/client';

export type ChannelPayload = {
  userId: string;
  notificationId?: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  actionUrl?: string;
};

type SendResult = { status: 'SENT' | 'FAILED' | 'SKIPPED'; detail?: string; simulated: boolean };

interface ChannelAdapter {
  channel: NotificationChannel;
  send(p: ChannelPayload): Promise<SendResult>;
}

/** IN_APP : la notification est déjà écrite par notify() ; on ne fait que tracer. */
const inApp: ChannelAdapter = {
  channel: 'IN_APP',
  async send() {
    return { status: 'SENT', simulated: false };
  },
};

/** PUSH / SMS / EMAIL : simulés (log serveur) tant qu'aucun fournisseur n'est configuré. */
function simulated(channel: NotificationChannel, envVar: string): ChannelAdapter {
  return {
    channel,
    async send(p) {
      const configured = !!process.env[envVar];
      if (configured) {
        // Point d'extension : appeler ici le SDK du fournisseur réel.
        return { status: 'SENT', detail: `via ${envVar}`, simulated: false };
      }
      console.info(`[NOTIFY:${channel}] (simulation) → ${p.userId} · ${p.title}`);
      return { status: 'SENT', detail: 'simulation (aucun fournisseur configuré)', simulated: true };
    },
  };
}

/** Webhook sortant optionnel (relais vers un service tiers). */
const webhookOut: ChannelAdapter = {
  channel: 'PUSH',
  async send(p) {
    const url = process.env.NOTIFY_WEBHOOK_URL;
    if (!url) return { status: 'SKIPPED', detail: 'NOTIFY_WEBHOOK_URL absent', simulated: true };
    try {
      const bodyStr = JSON.stringify({
        userId: p.userId, category: p.category, priority: p.priority,
        title: p.title, body: p.body, actionUrl: p.actionUrl,
      });
      const secret = process.env.NOTIFY_WEBHOOK_SECRET ?? '';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-kessia-signature': secret ? hashToken(secret + bodyStr) : '',
        },
        body: bodyStr,
      });
      return res.ok
        ? { status: 'SENT', detail: `webhook ${res.status}`, simulated: false }
        : { status: 'FAILED', detail: `webhook ${res.status}`, simulated: false };
    } catch (e) {
      return { status: 'FAILED', detail: String(e), simulated: false };
    }
  },
};

const ADAPTERS: Record<NotificationChannel, ChannelAdapter> = {
  IN_APP: inApp,
  PUSH: process.env.NOTIFY_WEBHOOK_URL ? webhookOut : simulated('PUSH', 'PUSH_PROVIDER_KEY'),
  SMS: simulated('SMS', 'SMS_PROVIDER_KEY'),
  EMAIL: simulated('EMAIL', 'EMAIL_PROVIDER_KEY'),
};

/** Canaux retenus selon la priorité (au-delà de l'in-app). */
export function channelsFor(priority: NotificationPriority): NotificationChannel[] {
  if (priority === 'CRITICAL') return ['IN_APP', 'PUSH', 'SMS'];
  if (priority === 'HIGH') return ['IN_APP', 'PUSH'];
  return ['IN_APP'];
}

/** Distribue une notification sur les canaux voulus. Ne lève jamais. */
export async function dispatch(payload: ChannelPayload, channels: NotificationChannel[]): Promise<void> {
  for (const ch of channels) {
    const adapter = ADAPTERS[ch];
    let result: SendResult;
    try {
      result = await adapter.send(payload);
    } catch (e) {
      result = { status: 'FAILED', detail: String(e), simulated: true };
    }
    try {
      await prisma.notificationDelivery.create({
        data: {
          notificationId: payload.notificationId ?? null,
          userId: payload.userId,
          channel: ch,
          status: result.status === 'SENT' ? 'SENT' : result.status === 'FAILED' ? 'FAILED' : 'SKIPPED',
          detail: result.detail ?? null,
          simulated: result.simulated,
        },
      });
    } catch {
      /* le journal de distribution ne doit jamais casser l'envoi */
    }
  }
}
