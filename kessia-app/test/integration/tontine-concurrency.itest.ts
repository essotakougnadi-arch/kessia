// ============================================================
// KESSIA — Concurrence Tontines (intégration, P1.7)
//
// Vérifie contre une vraie base, sous VRAIE concurrence (Promise.all) :
//   1. double activation (démarrage manuel + auto-activation à
//      l'adhésion) → jamais deux fois ;
//   2. adhésions concurrentes → positions toujours uniques ;
//   3. adhésions concurrentes dépassant la capacité → jamais plus de
//      `maxMembers` membres actifs ;
//   4. double invocation du tick cron → la seconde est ignorée (verrou
//      consultatif) ;
//   5. preuve (pas supposition) que la cotisation reste protégée par sa
//      clé d'idempotence Ledger déjà existante — P1.7 n'y a rien ajouté.
//
// Ledger / Wallet / Escrow / settleContribution() / checkAndAdvanceRound()
// non modifiés par ce chantier — le test 5 le vérifie sans les toucher.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH as tontinePatch } from '@/app/api/v1/tontine/[id]/route';
import { POST as membersPost } from '@/app/api/v1/tontine/[id]/members/route';
import { POST as cronPost } from '@/app/api/v1/cron/tontine-tick/route';
import { activateTontine } from '@/lib/tontine/orchestrator';
import { settleContribution } from '@/lib/tontine/contributions';
import { getWalletBalance } from '@/lib/ledger/ledger.service';
import { signAccessToken } from '@/lib/auth/session';
import { prisma, makeUser, cleanup, tag, settle, type ITestUser } from './helpers';

const userIds: string[] = [];
const tontineIds: string[] = [];
afterEach(async () => {
  await settle();
  await cleanup({ userIds: userIds.splice(0), tontineIds: tontineIds.splice(0) });
});

function tokenFor(user: ITestUser): string {
  return signAccessToken({ sub: user.id, phone: user.phone, role: 'USER' });
}

async function makeTontine(opts: {
  createdBy: ITestUser;
  maxMembers: number;
  members?: ITestUser[]; // membres actifs déjà présents, en plus de l'organisateur
}) {
  const inviteCode = `IT-${tag()}`;
  const now = new Date();
  const t = await prisma.tontine.create({
    data: {
      name: `IT Concurrence ${tag()}`,
      type: 'CLASSIC_ROTATING',
      amount: 1_000, currency: 'XOF', frequency: 'MONTHLY',
      startDate: now, maxMembers: opts.maxMembers, totalRounds: opts.maxMembers,
      inviteCode, createdById: opts.createdBy.id,
      members: {
        create: [
          { userId: opts.createdBy.id, status: 'ACTIVE', orderPosition: 1, joinedAt: now },
          ...(opts.members ?? []).map((m, i) => ({
            userId: m.id, status: 'ACTIVE' as const,
            orderPosition: i + 2, joinedAt: new Date(now.getTime() + i + 1),
          })),
        ],
      },
    },
  });
  return { id: t.id, inviteCode };
}

function patchStart(tontineId: string, token: string) {
  return tontinePatch(
    new NextRequest(`http://localhost/api/v1/tontine/${tontineId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'start' }),
    }),
    { params: Promise.resolve({ id: tontineId }) }
  );
}

function joinRequest(tontineId: string, token: string, inviteCode: string) {
  return membersPost(
    new NextRequest(`http://localhost/api/v1/tontine/${tontineId}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ inviteCode }),
    }),
    { params: Promise.resolve({ id: tontineId }) }
  );
}

describe('Concurrence Tontines — activation (P1.7)', () => {
  it('double « démarrage » manuel simultané par l’organisateur : une seule activation', async () => {
    const organizer = await makeUser({ balance: 0 });
    const member = await makeUser({ balance: 0 });
    userIds.push(organizer.id, member.id);
    const { id: tontineId } = await makeTontine({ createdBy: organizer, maxMembers: 2, members: [member] });
    tontineIds.push(tontineId);
    const token = tokenFor(organizer);

    const [r1, r2] = await Promise.all([patchStart(tontineId, token), patchStart(tontineId, token)]);
    const statuses = [r1.status, r2.status].sort();
    // Un seul « start » gagne (200) ; l'autre trouve la tontine déjà démarrée (400).
    expect(statuses).toEqual([200, 400]);
    await settle(); // laisse recordTontineEvent (fire-and-forget) se poser

    const t = await prisma.tontine.findUniqueOrThrow({ where: { id: tontineId } });
    expect(t.status).toBe('ACTIVE');
    expect(await prisma.tontineEvent.count({ where: { tontineId, type: 'ACTIVATED' } })).toBe(1);
    // Une seule cotisation créée par membre pour le tour 1 (pas de doublon).
    expect(await prisma.tontineContribution.count({ where: { tontineId, round: 1 } })).toBe(2);
  });
});

describe('Concurrence Tontines — adhésion (P1.7)', () => {
  it('adhésions concurrentes sans dépasser la capacité : positions toutes uniques, aucune collision', async () => {
    const organizer = await makeUser({ balance: 0 });
    userIds.push(organizer.id);
    const { id: tontineId, inviteCode } = await makeTontine({ createdBy: organizer, maxMembers: 10 });
    tontineIds.push(tontineId);

    const joiners = await Promise.all(Array.from({ length: 5 }, () => makeUser({ balance: 0 })));
    userIds.push(...joiners.map((j) => j.id));

    const responses = await Promise.all(
      joiners.map((j) => joinRequest(tontineId, tokenFor(j), inviteCode))
    );
    expect(responses.every((r) => r.status === 201)).toBe(true);

    const members = await prisma.tontineMember.findMany({
      where: { tontineId, status: 'ACTIVE' },
      select: { orderPosition: true },
    });
    const positions = members.map((m) => m.orderPosition).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(positions).toEqual([1, 2, 3, 4, 5, 6]); // organisateur (1) + 5 arrivants, toutes uniques
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('adhésions concurrentes dépassant la capacité : jamais plus de maxMembers membres actifs', async () => {
    const organizer = await makeUser({ balance: 0 });
    userIds.push(organizer.id);
    // maxMembers = 2, organisateur déjà en place → 1 seule place restante.
    const { id: tontineId, inviteCode } = await makeTontine({ createdBy: organizer, maxMembers: 2 });
    tontineIds.push(tontineId);

    const joiners = await Promise.all(Array.from({ length: 3 }, () => makeUser({ balance: 0 })));
    userIds.push(...joiners.map((j) => j.id));

    const responses = await Promise.all(
      joiners.map((j) => joinRequest(tontineId, tokenFor(j), inviteCode))
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 400, 400]); // 1 place, 1 gagnant, 2 refus « complète »

    const activeMembers = await prisma.tontineMember.count({ where: { tontineId, status: 'ACTIVE' } });
    expect(activeMembers).toBe(2); // jamais dépassé
    await settle(); // laisse recordTontineEvent (fire-and-forget) se poser

    // La dernière place prise déclenche l'auto-activation — une seule fois.
    const t = await prisma.tontine.findUniqueOrThrow({ where: { id: tontineId } });
    expect(t.status).toBe('ACTIVE');
    expect(await prisma.tontineEvent.count({ where: { tontineId, type: 'ACTIVATED' } })).toBe(1);
  });
});

describe('Concurrence Tontines — cron (P1.7)', () => {
  it('deux invocations concurrentes du tick cron : la seconde est ignorée (verrou consultatif)', async () => {
    function cronRequest() {
      return cronPost(new NextRequest('http://localhost/api/v1/cron/tontine-tick', { method: 'POST' }));
    }
    const [r1, r2] = await Promise.all([cronRequest(), cronRequest()]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const [b1, b2] = await Promise.all([r1.json(), r2.json()]);
    const bodies = [b1, b2] as { data: { skipped?: boolean; tontine?: unknown } }[];

    const skipped = bodies.filter((b) => b.data.skipped === true);
    const ran = bodies.filter((b) => b.data.skipped !== true);
    expect(skipped.length).toBe(1);
    expect(ran.length).toBe(1);
    expect(ran[0].data).toHaveProperty('tontine'); // le tick qui s'est réellement exécuté
  });
});

describe('Concurrence Tontines — cotisation (preuve de protection existante, P1.7)', () => {
  it('deux cotisations concurrentes du même membre/tour : un seul débit (clé Ledger déjà existante, non modifiée ici)', async () => {
    const organizer = await makeUser({ balance: 0 });
    const payer = await makeUser({ balance: 10_000 });
    userIds.push(organizer.id, payer.id);
    const { id: tontineId } = await makeTontine({ createdBy: organizer, maxMembers: 2, members: [payer] });
    tontineIds.push(tontineId);
    expect((await activateTontine(tontineId)).ok).toBe(true);

    const member = await prisma.tontineMember.findFirstOrThrow({ where: { tontineId, userId: payer.id } });
    const tontine = await prisma.tontine.findUniqueOrThrow({ where: { id: tontineId } });
    const amount = Number(tontine.amount);

    const input = {
      tontineId, memberId: member.id, payerUserId: payer.id, round: 1,
      amount, tontineName: tontine.name, currency: tontine.currency,
    };
    const [r1, r2] = await Promise.all([settleContribution(input), settleContribution(input)]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    expect(await getWalletBalance(payer.walletId)).toBe(10_000 - amount); // un seul débit
    expect(
      await prisma.tontineContribution.count({
        where: { tontineId, memberId: member.id, round: 1, status: 'PAID' },
      })
    ).toBe(1);
  });
});
