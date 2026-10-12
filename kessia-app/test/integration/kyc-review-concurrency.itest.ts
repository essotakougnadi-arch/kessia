// ============================================================
// KESSIA — Audit module KYC : revue admin sous concurrence
//
// Constat (lecture de code, app/api/v1/admin/kyc/[id]/route.ts) : la
// route PATCH ne vérifie JAMAIS le statut courant avant d'appliquer une
// décision (contrairement à seller-verification, qui exigeait
// PENDING_REVIEW). Ce test VÉRIFIE PAR LA PREUVE, pas par supposition,
// ce que cela produit sous double-clic/double-tab admin réel.
//
// Volontairement AUCUN correctif appliqué ici : l'absence de garde
// semble permettre à un agent de conformité de corriger une décision
// déjà prise (ex. VERIFIED → REJECTED après découverte d'une fraude),
// ce qui pourrait être voulu. Changer ce comportement serait une
// décision produit, pas un correctif de bug — voir PROGRESS_TRACKER.md.
// Ce test documente uniquement l'effet de bord démontré : notifications
// et entrées d'audit dupliquées en cas d'appels vraiment concurrents.
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

describe('Audit — PATCH /admin/kyc/[id] sous concurrence (constat, pas un correctif)', () => {
  it('vingt décisions VRAIMENT concurrentes sur le même dossier : toutes « réussissent » (aucune garde de statut), notifications et audits dupliqués', async () => {
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
    expect(results.every((r) => r.status === 200)).toBe(true); // confirme : aucune garde

    await settle();
    const notifCount = await prisma.notification.count({ where: { userId: user.id, category: 'SECURITY' } });
    const auditCount = await prisma.auditLog.count({ where: { action: 'kyc.review_verified', entityId: kycCase.id } });
    // Constat démontré : 20 écritures réelles, pas 1 — c'est l'absence de
    // garde de transition qui le permet (à la différence de
    // seller-verification, corrigé). Documenté, pas corrigé ici (voir
    // en-tête du fichier et PROGRESS_TRACKER.md, Phase 3 — KYC).
    expect(notifCount).toBe(20);
    expect(auditCount).toBe(20);

    const after = await prisma.kycCase.findUniqueOrThrow({ where: { id: kycCase.id } });
    expect(after.status).toBe('VERIFIED'); // état final cohérent malgré les doublons
  });
});
