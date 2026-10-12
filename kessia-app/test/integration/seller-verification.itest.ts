// ============================================================
// KESSIA — Vérification fournisseur « KESSIA Verification » (intégration)
//
// Vérifie contre une vraie base : soumission (avec contrôle de
// complétude automatique), permissions (propriétaire vs tiers vs
// admin), cycle approbation/refus, badge actif uniquement après
// approbation explicite et jamais après expiration, renouvellement
// (resoumission après refus), journal d'audit.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { signAccessToken } from '@/lib/auth/session';
import {
  submitSellerVerification,
  reviewSellerVerification,
  isSellerVerifiedBadgeActive,
  expireOverdueSellerVerifications,
} from '@/lib/marketplace/seller-verification';
import { POST as submitRoute, GET as statusRoute } from '@/app/api/v1/business/[id]/verification/route';
import { PATCH as reviewRoute } from '@/app/api/v1/admin/seller-verifications/[id]/route';
import { prisma, makeUser, cleanup, settle, tag } from './helpers';

const userIds: string[] = [];
const businessIds: string[] = [];

afterEach(async () => {
  // `recordAudit` est appelé en tâche de fond (`void recordAudit(...)`) par
  // submitSellerVerification/reviewSellerVerification : laisser le temps à
  // cette écriture asynchrone de se terminer avant de supprimer les
  // utilisateurs/entreprises, sinon la FK audit_logs_userId_fkey échoue
  // (course observée : cleanup plus rapide que l'écriture d'audit).
  await settle();
  for (const id of businessIds.splice(0)) {
    await prisma.sellerVerificationDocument.deleteMany({ where: { verification: { businessId: id } } }).catch(() => {});
    await prisma.sellerVerification.deleteMany({ where: { businessId: id } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id } }).catch(() => {});
  }
  await cleanup({ userIds: userIds.splice(0) });
});

const FAKE_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function makeBusiness(ownerId: string, opts?: { phone?: string | null; city?: string | null }) {
  // `?? défaut` traiterait un `null` explicitement passé comme absent —
  // utilisation explicite de `in`/valeur fournie pour permettre de tester
  // un profil réellement incomplet (phone/city nuls intentionnellement).
  const phone = opts && 'phone' in opts ? opts.phone : '+22890000000';
  const city = opts && 'city' in opts ? opts.city : 'Lomé';
  const b = await prisma.business.create({
    data: { userId: ownerId, name: `IT Business ${tag()}`, sector: 'Commerce', phone, city },
  });
  businessIds.push(b.id);
  return b;
}

function tokenFor(u: { id: string; phone: string; role?: 'USER' | 'COMPLIANCE' }) {
  return signAccessToken({ sub: u.id, phone: u.phone, role: u.role ?? 'USER' });
}

describe('submitSellerVerification — contrôle automatique + permissions', () => {
  it('refuse si le profil entreprise est incomplet (téléphone/ville manquants)', async () => {
    const owner = await makeUser({ balance: 0 });
    userIds.push(owner.id);
    const business = await makeBusiness(owner.id, { phone: null });

    const r = await submitSellerVerification(business.id, owner.id, [
      { type: 'BUSINESS_REGISTRATION', fileUrl: FAKE_IMAGE },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CONFLICT');
  });

  it('refuse un tiers qui n\'est pas propriétaire de l\'entreprise', async () => {
    const owner = await makeUser({ balance: 0 });
    const attacker = await makeUser({ balance: 0 });
    userIds.push(owner.id, attacker.id);
    const business = await makeBusiness(owner.id);

    const r = await submitSellerVerification(business.id, attacker.id, [
      { type: 'BUSINESS_REGISTRATION', fileUrl: FAKE_IMAGE },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN');
  });

  it('refuse une soumission sans aucun document', async () => {
    const owner = await makeUser({ balance: 0 });
    userIds.push(owner.id);
    const business = await makeBusiness(owner.id);
    const r = await submitSellerVerification(business.id, owner.id, []);
    expect(r.ok).toBe(false);
  });

  it('soumission valide → PENDING_REVIEW, documents enregistrés', async () => {
    const owner = await makeUser({ balance: 0 });
    userIds.push(owner.id);
    const business = await makeBusiness(owner.id);

    const r = await submitSellerVerification(business.id, owner.id, [
      { type: 'BUSINESS_REGISTRATION', label: 'RCCM', fileUrl: FAKE_IMAGE },
      { type: 'OWNER_ID', fileUrl: FAKE_IMAGE },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe('PENDING_REVIEW');

    const docs = await prisma.sellerVerificationDocument.findMany({ where: { verificationId: r.verificationId } });
    expect(docs).toHaveLength(2);
  });

  it('refuse une resoumission tant qu\'un dossier est déjà PENDING_REVIEW', async () => {
    const owner = await makeUser({ balance: 0 });
    userIds.push(owner.id);
    const business = await makeBusiness(owner.id);
    await submitSellerVerification(business.id, owner.id, [{ type: 'OTHER', fileUrl: FAKE_IMAGE }]);

    const r2 = await submitSellerVerification(business.id, owner.id, [{ type: 'OTHER', fileUrl: FAKE_IMAGE }]);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe('CONFLICT');
  });
});

describe('reviewSellerVerification — décision admin, badge, audit', () => {
  it('approbation : statut APPROVED, badge actif, audit émis', async () => {
    const owner = await makeUser({ balance: 0 });
    const admin = await makeUser({ balance: 0 });
    userIds.push(owner.id, admin.id);
    const business = await makeBusiness(owner.id);
    const sub = await submitSellerVerification(business.id, owner.id, [{ type: 'OTHER', fileUrl: FAKE_IMAGE }]);
    if (!sub.ok) throw new Error('setup');

    const r = await reviewSellerVerification(sub.verificationId, admin.id, 'APPROVED');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe('APPROVED');

    const v = await prisma.sellerVerification.findUniqueOrThrow({ where: { id: sub.verificationId } });
    expect(isSellerVerifiedBadgeActive(v)).toBe(true);
    expect(v.reviewedById).toBe(admin.id);
    expect(v.reviewedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({ where: { action: 'seller_verification.approved', entityId: sub.verificationId } });
    expect(audit).toBeTruthy();
  });

  it('refus : exige un motif, statut REJECTED, badge jamais actif', async () => {
    const owner = await makeUser({ balance: 0 });
    const admin = await makeUser({ balance: 0 });
    userIds.push(owner.id, admin.id);
    const business = await makeBusiness(owner.id);
    const sub = await submitSellerVerification(business.id, owner.id, [{ type: 'OTHER', fileUrl: FAKE_IMAGE }]);
    if (!sub.ok) throw new Error('setup');

    const noReason = await reviewSellerVerification(sub.verificationId, admin.id, 'REJECTED');
    expect(noReason.ok).toBe(false);

    const r = await reviewSellerVerification(sub.verificationId, admin.id, 'REJECTED', { rejectionReason: 'Document illisible.' });
    expect(r.ok).toBe(true);

    const v = await prisma.sellerVerification.findUniqueOrThrow({ where: { id: sub.verificationId } });
    expect(v.status).toBe('REJECTED');
    expect(v.rejectionReason).toBe('Document illisible.');
    expect(isSellerVerifiedBadgeActive(v)).toBe(false);
  });

  it('après refus, le fournisseur peut resoumettre (renouvellement du dossier)', async () => {
    const owner = await makeUser({ balance: 0 });
    const admin = await makeUser({ balance: 0 });
    userIds.push(owner.id, admin.id);
    const business = await makeBusiness(owner.id);
    const sub = await submitSellerVerification(business.id, owner.id, [{ type: 'OTHER', fileUrl: FAKE_IMAGE }]);
    if (!sub.ok) throw new Error('setup');
    await reviewSellerVerification(sub.verificationId, admin.id, 'REJECTED', { rejectionReason: 'x' });

    const resub = await submitSellerVerification(business.id, owner.id, [{ type: 'BUSINESS_REGISTRATION', fileUrl: FAKE_IMAGE }]);
    expect(resub.ok).toBe(true);
    if (resub.ok) expect(resub.status).toBe('PENDING_REVIEW');
  });

  it('approbation avec expiresAt dans le passé : badge inactif (expiré), jamais confondu avec « jamais approuvé »', () => {
    expect(isSellerVerifiedBadgeActive({ status: 'APPROVED', expiresAt: new Date(Date.now() - 1000) })).toBe(false);
    expect(isSellerVerifiedBadgeActive({ status: 'APPROVED', expiresAt: null })).toBe(true);
    expect(isSellerVerifiedBadgeActive(null)).toBe(false);
  });

  it('expireOverdueSellerVerifications bascule APPROVED→EXPIRED une fois l\'échéance dépassée', async () => {
    const owner = await makeUser({ balance: 0 });
    const admin = await makeUser({ balance: 0 });
    userIds.push(owner.id, admin.id);
    const business = await makeBusiness(owner.id);
    const sub = await submitSellerVerification(business.id, owner.id, [{ type: 'OTHER', fileUrl: FAKE_IMAGE }]);
    if (!sub.ok) throw new Error('setup');
    await reviewSellerVerification(sub.verificationId, admin.id, 'APPROVED', { expiresAt: new Date(Date.now() - 1000) });

    const { expired } = await expireOverdueSellerVerifications();
    expect(expired).toBeGreaterThanOrEqual(1);

    const v = await prisma.sellerVerification.findUniqueOrThrow({ where: { id: sub.verificationId } });
    expect(v.status).toBe('EXPIRED');
  });
});

describe('Routes HTTP — permissions bout en bout', () => {
  it('POST /business/[id]/verification : un tiers reçoit 403, le propriétaire réussit, un admin voit le dossier', async () => {
    const owner = await makeUser({ balance: 0 });
    const attacker = await makeUser({ balance: 0 });
    const admin = await makeUser({ balance: 0 });
    userIds.push(owner.id, attacker.id, admin.id);
    const business = await makeBusiness(owner.id);

    const attackerRes = await submitRoute(
      new NextRequest(`http://localhost/api/v1/business/${business.id}/verification`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(attacker)}` },
        body: JSON.stringify({ documents: [{ type: 'OTHER', fileUrl: FAKE_IMAGE }] }),
      }),
      { params: Promise.resolve({ id: business.id }) }
    );
    expect(attackerRes!.status).toBe(403);

    const ownerRes = await submitRoute(
      new NextRequest(`http://localhost/api/v1/business/${business.id}/verification`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(owner)}` },
        body: JSON.stringify({ documents: [{ type: 'OTHER', fileUrl: FAKE_IMAGE }] }),
      }),
      { params: Promise.resolve({ id: business.id }) }
    );
    expect(ownerRes!.status).toBe(201);
    const ownerBody = (await ownerRes!.json()) as { data: { verificationId: string } };

    const statusRes = await statusRoute(
      new NextRequest(`http://localhost/api/v1/business/${business.id}/verification`, {
        headers: { authorization: `Bearer ${tokenFor(owner)}` },
      }),
      { params: Promise.resolve({ id: business.id }) }
    );
    expect(statusRes!.status).toBe(200);
    const statusBody = (await statusRes!.json()) as { data: { status: string; badgeActive: boolean } };
    expect(statusBody.data.status).toBe('PENDING_REVIEW');
    expect(statusBody.data.badgeActive).toBe(false);

    // Un USER standard ne doit jamais pouvoir approuver (garde admin COMPLIANCE_ROLES).
    const userReview = await reviewRoute(
      new NextRequest(`http://localhost/api/v1/admin/seller-verifications/${ownerBody.data.verificationId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(owner)}` },
        body: JSON.stringify({ decision: 'APPROVED' }),
      }),
      { params: Promise.resolve({ id: ownerBody.data.verificationId }) }
    );
    expect(userReview.status).toBe(403);

    const adminReview = await reviewRoute(
      new NextRequest(`http://localhost/api/v1/admin/seller-verifications/${ownerBody.data.verificationId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor({ ...admin, role: 'COMPLIANCE' })}` },
        body: JSON.stringify({ decision: 'APPROVED' }),
      }),
      { params: Promise.resolve({ id: ownerBody.data.verificationId }) }
    );
    expect(adminReview.status).toBe(200);
  });
});
