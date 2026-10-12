// ============================================================
// KESSIA — Empreintes d'appareils (cahier des charges §32)
//
// Empreinte prudente à partir des en-têtes de la requête (pas de
// fingerprinting invasif côté client). Sert uniquement à repérer un
// nouvel appareil pour une action sensible.
// ============================================================

import prisma from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
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

    const knownDeviceCount = await prisma.device.count({ where: { userId } });

    // `upsert` (une seule requête atomique côté base) plutôt que
    // find-then-create : deux enregistrements concurrents du même
    // appareil (même empreinte) ne se disputent plus la contrainte
    // unique (userId, fingerprint) — constat P2.20 volet 2, prouvé par
    // test (`devices.itest.ts`). `ipHash: ipHash ?? undefined` dans la
    // branche update : `undefined` laisse le champ inchangé côté Prisma
    // (contrairement à `null`), même effet que l'ancien repli sur
    // `existing.ipHash` sans avoir besoin de le relire.
    const device = await prisma.device.upsert({
      where: { userId_fingerprint: { userId, fingerprint } },
      create: {
        userId, fingerprint, userAgent: userAgent ?? null, ipHash,
        // Le tout premier appareil d'un compte est considéré de confiance.
        trusted: knownDeviceCount === 0,
      },
      update: { lastSeenAt: new Date(), seenCount: { increment: 1 }, ipHash: ipHash ?? undefined },
    });

    // `seenCount` vaut 1 seulement juste après une création (valeur par
    // défaut du schéma, jamais réatteinte par un increment ultérieur
    // puisqu'il part toujours d'une valeur ≥ 1) — distingue create/update
    // après l'upsert sans course de lecture supplémentaire.
    const wasCreated = device.seenCount === 1;
    return {
      id: device.id,
      fingerprint,
      isNew: wasCreated && knownDeviceCount > 0,
      trusted: device.trusted,
      seenCount: device.seenCount,
      knownDeviceCount: wasCreated ? knownDeviceCount + 1 : knownDeviceCount,
    };
  } catch (e) {
    logger.error('fraud_record_device_failed', { userId, error: e });
    return null;
  }
}
