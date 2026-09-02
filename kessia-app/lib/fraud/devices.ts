// ============================================================
// KESSIA — Empreintes d'appareils (cahier des charges §32)
//
// Empreinte prudente à partir des en-têtes de la requête (pas de
// fingerprinting invasif côté client). Sert uniquement à repérer un
// nouvel appareil pour une action sensible.
// ============================================================

import prisma from '@/lib/db/prisma';
import { hashToken } from '@/lib/utils/crypto';
import { requestMeta } from '@/lib/audit/audit.service';

type Headersish = { get(name: string): string | null };

export function deviceFingerprint(req: { headers: Headersish }): string {
  const { userAgent } = requestMeta(req);
  const lang = req.headers.get('accept-language') ?? '';
  const platform = req.headers.get('sec-ch-ua-platform') ?? '';
  const mobile = req.headers.get('sec-ch-ua-mobile') ?? '';
  return hashToken(`${userAgent ?? 'ua'}|${lang}|${platform}|${mobile}`).slice(0, 32);
}

export type DeviceInfo = {
  id: string;
  fingerprint: string;
  isNew: boolean;
  trusted: boolean;
  seenCount: number;
  knownDeviceCount: number;
};

/** Enregistre / met à jour l'appareil courant. Ne lève jamais. */
export async function recordDevice(userId: string, req: { headers: Headersish }): Promise<DeviceInfo | null> {
  try {
    const fingerprint = deviceFingerprint(req);
    const { userAgent, ipAddress } = requestMeta(req);
    const ipHash = ipAddress ? hashToken(ipAddress).slice(0, 32) : null;

    const existing = await prisma.device.findUnique({
      where: { userId_fingerprint: { userId, fingerprint } },
    });
    const knownDeviceCount = await prisma.device.count({ where: { userId } });

    if (existing) {
      const updated = await prisma.device.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), seenCount: { increment: 1 }, ipHash: ipHash ?? existing.ipHash },
      });
      return {
        id: updated.id, fingerprint, isNew: false, trusted: updated.trusted,
        seenCount: updated.seenCount, knownDeviceCount,
      };
    }

    const created = await prisma.device.create({
      data: {
        userId, fingerprint, userAgent: userAgent ?? null, ipHash,
        // Le tout premier appareil d'un compte est considéré de confiance.
        trusted: knownDeviceCount === 0,
      },
    });
    return {
      id: created.id, fingerprint, isNew: knownDeviceCount > 0, trusted: created.trusted,
      seenCount: 1, knownDeviceCount: knownDeviceCount + 1,
    };
  } catch (e) {
    console.error('[FRAUD] recordDevice', e);
    return null;
  }
}
