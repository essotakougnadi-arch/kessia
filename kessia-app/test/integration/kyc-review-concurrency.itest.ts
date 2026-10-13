// ============================================================
// KESSIA — Module KYC : revue admin sous concurrence
//
// Constat initial (lecture de code) : PATCH /admin/kyc/[id] ne
// vérifiait jamais si le dossier avait déjà la décision demandée avant
// d'écrire — 20 appels concurrents identiques (double-clic admin)
// produisaient 20 écritures réelles, 20 notifications, 20 entrées
// d'audit. Validé avec le propriétaire (AskUserQuestion) : la
// ré-décision délibérée doit TOUJOURS rester possible à tout moment
// (ex. corriger un dossier VERIFIED en REJECTED après découverte d'une
// fraude) — seul le doublon de concurrence doit disparaître.
//
// Correctif appliqué : la transition n'écrit que si elle change
// réellement le statut (`status: { not: decision }` dans le WHERE de
// l'update). Un rejeu exact de la même décision déjà appliquée devient
// un no-op (`alreadyApplied: true`), sans notification/audit dupliqué.
// Une décision VRAIMENT différente reste toujours appliquée.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { signAccessToken } from '@/lib/auth/session';
import { PATCH as reviewKyc } from '@/app/api/v1/admin/kyc/[id]/route';
import { makeUser, cleanup, settle } from './helpers';

const userIds: string[] = [];
const kycCaseIds: string[] = [];

afterEach(async () => {
  await settle();
  for (const id of kycCaseIds.splice(0)) {
    await prisma.kycDocument.deleteMany({ where: { kycCaseId: id } }).catch(() => {});
    await prisma.kycCase.deleteMany({ where: { id } }).catch(() => {});
  }
  await cleanup({ userIds: userIds.splice(0) });
});

function patchKyc(caseId: string, token: string, body: Record<string, unknown>) {
  return reviewKyc(
    new NextRequest(`http://localhost/api/v1/admin/kyc/${caseId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: caseId }) }
  );
}

describe('PATCH /admin/kyc/[id] sous concurrence — doublon corrigé, ré-décision préservée', () => {
  it('vingt décisions VRAIMENT concurrentes et IDENTIQUES : une seule écriture réelle, une seule notification, un seul audit', async () => {
    const user = await makeUser({ kycStatus: 'UNDER_REVIEW' });
    const admin = await makeUser();
    userIds.push(user.id, admin.id);
    const kycCase = await prisma.kycCase.create({
      data: { userId: user.id, status: 'UNDER_REVIEW', level: 1, submittedAt: new Date() },
    });
    kycCaseIds.push(kycCase.id);
    const adminToken = signAccessToken({ sub: admin.id, phone: admin.phone, role: 'COMPLIANCE' });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => patchKyc(kycCase.id, adminToken, { decision: 'VERIFIED', level: 2 }))
    );
    expect(results.every((r) => r.status === 200)).toBe(true); // jamais d'échec/500, même en rejeu

    const bodies = await Promise.all(results.map((r) => r.json() as Promise<{ data: { alreadyApplied?: boolean } }>));
    const realCount = bodies.filter((b) => !b.data.alreadyApplied).length;
    expect(realCount).toBe(1); // une seule des 20 a réellement appliqué la transition

    await settle();
    const notifCount = await prisma.notification.count({ where: { userId: user.id, category: 'SECURITY' } });
    const auditCount = await prisma.auditLog.count({ where: { action: 'kyc.review_verified', entityId: kycCase.id } });
    expect(notifCount).toBe(1); // corrigé : plus de 20 notifications pour un double-clic
    expect(auditCount).toBe(1);

    const after = await prisma.kycCase.findUniqueOrThrow({ where: { id: kycCase.id } });
    expect(after.status).toBe('VERIFIED');
    expect(after.level).toBe(2);

    const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(userAfter.kycStatus).toBe('VERIFIED');
    expect(userAfter.kycLevel).toBe(2);
  });

  it('une ré-décision VRAIMENT différente, faite plus tard (pas de concurrence), reste toujours appliquée (comportement produit préservé)', async () => {
    const user = await makeUser({ kycStatus: 'UNDER_REVIEW' });
    const admin = await makeUser();
    userIds.push(user.id, admin.id);
    const kycCase = await prisma.kycCase.create({
      data: { userId: user.id, status: 'UNDER_REVIEW', level: 1, submittedAt: new Date() },
    });
    kycCaseIds.push(kycCase.id);
    const adminToken = signAccessToken({ sub: admin.id, phone: admin.phone, role: 'COMPLIANCE' });

    const first = await patchKyc(kycCase.id, adminToken, { decision: 'VERIFIED', level: 2 });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { data: { alreadyApplied?: boolean } };
    expect(firstBody.data.alreadyApplied).toBeFalsy();

    // Correction délibérée, plus tard : VERIFIED → REJECTED (ex. fraude
    // découverte après coup). Doit RÉUSSIR, pas être traité comme un
    // doublon — c'est précisément le comportement que la garde ne doit
    // jamais bloquer.
    const correction = await patchKyc(kycCase.id, adminToken, { decision: 'REJECTED', reason: 'Fraude découverte a posteriori.' });
    expect(correction.status).toBe(200);
    const correctionBody = (await correction.json()) as { data: { alreadyApplied?: boolean } };
    expect(correctionBody.data.alreadyApplied).toBeFalsy();

    const after = await prisma.kycCase.findUniqueOrThrow({ where: { id: kycCase.id } });
    expect(after.status).toBe('REJECTED');
    expect(after.rejectionReason).toBe('Fraude découverte a posteriori.');

    await settle();
    // 2 décisions réellement différentes → 2 notifications distinctes.
    expect(await prisma.notification.count({ where: { userId: user.id, category: 'SECURITY' } })).toBe(2);
  });

  it('rejouer exactement la même décision déjà appliquée (hors concurrence) renvoie alreadyApplied, sans nouvelle notification', async () => {
    const user = await makeUser({ kycStatus: 'UNDER_REVIEW' });
    const admin = await makeUser();
    userIds.push(user.id, admin.id);
    const kycCase = await prisma.kycCase.create({
      data: { userId: user.id, status: 'UNDER_REVIEW', level: 1, submittedAt: new Date() },
    });
    kycCaseIds.push(kycCase.id);
    const adminToken = signAccessToken({ sub: admin.id, phone: admin.phone, role: 'COMPLIANCE' });

    await patchKyc(kycCase.id, adminToken, { decision: 'VERIFIED', level: 2 });
    await settle();
    const replay = await patchKyc(kycCase.id, adminToken, { decision: 'VERIFIED', level: 2 });
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as { data: { alreadyApplied?: boolean } };
    expect(replayBody.data.alreadyApplied).toBe(true);

    await settle();
    expect(await prisma.notification.count({ where: { userId: user.id, category: 'SECURITY' } })).toBe(1);
  });
});
