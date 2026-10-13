// ============================================================
// KESSIA — lib/fraud/devices.ts::recordDevice sous concurrence
//
// Constat initial (P2.20 volet 2, scénario 8 — transferts concurrents) :
// deux enregistrements concurrents du MÊME appareil (même empreinte)
// pour un utilisateur sans appareil connu violaient la contrainte
// unique (userId, fingerprint) — l'un des deux appels échouait
// (absorbé par le catch, loggé `fraud_record_device_failed`, ne
// casse jamais la requête appelante, mais perd l'information
// d'appareil pour cet appel).
//
// Corrigé en remplaçant le find-then-create par un upsert atomique.
// Ce test prouve la correction par appel réel concurrent, pas par
// lecture de code.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import prisma from '@/lib/db/prisma';
import { recordDevice } from '@/lib/fraud/devices';
import { makeUser, cleanup } from './helpers';

const userIds: string[] = [];

afterEach(async () => {
  await cleanup({ userIds: userIds.splice(0) });
});

function fakeRequest(ua: string) {
  return {
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'user-agent') return ua;
        return null;
      },
    },
  };
}

describe('recordDevice — concurrence (constat P2.20 volet 2, corrigé)', () => {
  it('vingt enregistrements VRAIMENT concurrents du MÊME appareil (même empreinte) : aucun échec, un seul Device créé', async () => {
    const user = await makeUser();
    userIds.push(user.id);
    const req = fakeRequest('itest-same-device/1.0');

    const results = await Promise.all(Array.from({ length: 20 }, () => recordDevice(user.id, req)));
    // Avant correctif : certains appels revenaient `null` (violation de
    // contrainte unique absorbée par le catch). Corrigé : jamais null.
    expect(results.every((r) => r !== null)).toBe(true);

    const devices = await prisma.device.findMany({ where: { userId: user.id } });
    expect(devices).toHaveLength(1); // un seul Device réel, pas 20 tentatives en conflit
    expect(devices[0]!.seenCount).toBeGreaterThanOrEqual(1);
    expect(devices[0]!.trusted).toBe(true); // premier appareil du compte
  });

  it('deux empreintes différentes, concurrentes, pour un utilisateur sans appareil connu : les deux réussissent, deux Device distincts', async () => {
    const user = await makeUser();
    userIds.push(user.id);
    const reqA = fakeRequest('itest-device-A/1.0');
    const reqB = fakeRequest('itest-device-B/1.0');

    const [a, b] = await Promise.all([recordDevice(user.id, reqA), recordDevice(user.id, reqB)]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();

    const devices = await prisma.device.findMany({ where: { userId: user.id } });
    expect(devices).toHaveLength(2);
  });

  it('un appareil déjà connu, revu plusieurs fois (séquentiel) : seenCount augmente, jamais de doublon', async () => {
    const user = await makeUser();
    userIds.push(user.id);
    const req = fakeRequest('itest-repeat-device/1.0');

    await recordDevice(user.id, req);
    await recordDevice(user.id, req);
    const third = await recordDevice(user.id, req);

    expect(third?.seenCount).toBe(3);
    const devices = await prisma.device.findMany({ where: { userId: user.id } });
    expect(devices).toHaveLength(1);
  });
});
