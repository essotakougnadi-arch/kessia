// ============================================================
// KESSIA — Vérification fournisseur (« KESSIA Verification »)
//
// Même schéma de principe que lib/kyc (KycCase/KycDocument) —
// réutilisé délibérément, rien de réinventé : le fournisseur soumet des
// documents, un contrôle automatique minimal s'applique, puis un
// administrateur (COMPLIANCE_ROLES, lib/auth/admin.ts) approuve ou
// refuse. Le badge « Fournisseur vérifié » n'est jamais affiché avant
// une approbation explicite. Journal d'audit sur chaque transition.
//
// AUCUNE liste de documents légalement obligatoires n'est codée en
// dur ici (pas de RCCM, pas de numéro fiscal togolais/UEMOA imposé) —
// `SellerVerificationDocumentType` reste générique, `OTHER` + `label`
// libre couvrent le reste. La validation juridique de ce qui est
// RÉELLEMENT exigible reste externe à ce module.
// ============================================================

import prisma from '@/lib/db/prisma';
import { recordAudit } from '@/lib/audit/audit.service';
import { notify } from '@/lib/notifications/notify';
import type { SellerVerificationDocumentType, SellerVerificationStatus } from '@prisma/client';

export type SubmitDocumentInput = {
  type: SellerVerificationDocumentType;
  label?: string;
  fileUrl: string;
};

export type SubmitResult =
  | { ok: true; verificationId: string; status: SellerVerificationStatus }
  | { ok: false; error: string; code?: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' };

/**
 * Contrôle automatique minimal AVANT soumission — complétude du profil
 * entreprise, pas une vérification légale. Volontairement limité :
 * aucune règle de conformité par juridiction n'est codée ici.
 */
function businessProfileComplete(b: { name: string; phone: string | null; city: string | null }): string | null {
  if (!b.phone) return 'Le téléphone de l\'entreprise doit être renseigné avant de soumettre un dossier.';
  if (!b.city) return 'La ville de l\'entreprise doit être renseignée avant de soumettre un dossier.';
  return null;
}

/** Le fournisseur (propriétaire du Business) soumet ou resoumet son dossier. */
export async function submitSellerVerification(
  businessId: string,
  userId: string,
  documents: SubmitDocumentInput[]
): Promise<SubmitResult> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, userId: true, name: true, phone: true, city: true },
  });
  if (!business) return { ok: false, error: 'Entreprise introuvable.', code: 'NOT_FOUND' };
  if (business.userId !== userId) {
    return { ok: false, error: 'Action réservée au propriétaire de l\'entreprise.', code: 'FORBIDDEN' };
  }
  if (documents.length === 0) {
    return { ok: false, error: 'Au moins un document est requis.', code: 'CONFLICT' };
  }

  const incomplete = businessProfileComplete(business);
  if (incomplete) return { ok: false, error: incomplete, code: 'CONFLICT' };

  const existing = await prisma.sellerVerification.findUnique({ where: { businessId } });
  if (existing?.status === 'PENDING_REVIEW') {
    return { ok: false, error: 'Un dossier est déjà en cours d\'examen.', code: 'CONFLICT' };
  }
  if (existing?.status === 'APPROVED') {
    return { ok: false, error: 'Ce fournisseur est déjà vérifié.', code: 'CONFLICT' };
  }

  const verification = await prisma.$transaction(async (tx) => {
    const v = await tx.sellerVerification.upsert({
      where: { businessId },
      create: { businessId, status: 'PENDING_REVIEW', submittedAt: new Date() },
      update: {
        status: 'PENDING_REVIEW', submittedAt: new Date(),
        rejectionReason: null, reviewedAt: null, reviewedById: null, expiresAt: null,
      },
    });
    // Resoumission : repart avec les documents fournis maintenant — pas
    // d'historique cumulatif indéfini (version minimale, cf. audit log
    // pour la trace des transitions successives).
    await tx.sellerVerificationDocument.deleteMany({ where: { verificationId: v.id } });
    if (documents.length) {
      await tx.sellerVerificationDocument.createMany({
        data: documents.map((d) => ({ verificationId: v.id, type: d.type, label: d.label, fileUrl: d.fileUrl })),
      });
    }
    return v;
  });

  void recordAudit({
    userId, action: 'seller_verification.submitted', entity: 'SellerVerification', entityId: verification.id,
    metadata: { businessId, documentCount: documents.length },
  });

  return { ok: true, verificationId: verification.id, status: verification.status };
}

export type ReviewDecision = 'APPROVED' | 'REJECTED';

// Renouvellement annuel implicite (décision propriétaire, 2026-10-12) :
// si l'admin n'indique pas de date d'expiration à l'approbation, le
// badge expire automatiquement 1 an après. L'admin peut toujours fixer
// une autre date explicitement — seule l'ABSENCE de date déclenche ce
// défaut (`opts?.expiresAt` nul/absent ≠ une date explicite).
const DEFAULT_APPROVAL_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;

export type ReviewResult =
  | { ok: true; status: SellerVerificationStatus }
  | { ok: false; error: string; code?: 'NOT_FOUND' | 'CONFLICT' };

/** Décision administrative (COMPLIANCE_ROLES uniquement, gardé côté route). */
export async function reviewSellerVerification(
  verificationId: string,
  adminUserId: string,
  decision: ReviewDecision,
  opts?: { rejectionReason?: string; expiresAt?: Date | null }
): Promise<ReviewResult> {
  const v = await prisma.sellerVerification.findUnique({ where: { id: verificationId } });
  if (!v) return { ok: false, error: 'Dossier introuvable.', code: 'NOT_FOUND' };
  if (v.status !== 'PENDING_REVIEW') {
    return { ok: false, error: 'Ce dossier n\'est pas en attente d\'examen.', code: 'CONFLICT' };
  }
  if (decision === 'REJECTED' && !opts?.rejectionReason) {
    return { ok: false, error: 'Un motif de refus est requis.', code: 'CONFLICT' };
  }

  // Transition atomique : la garde `status: 'PENDING_REVIEW'` est portée
  // par le WHERE de l'UPDATE lui-même (pas seulement par la lecture
  // ci-dessus, qui laisse une fenêtre de course à deux appels
  // concurrents — double-clic admin ou deux décisions rivales). Un seul
  // appel peut gagner la ligne ; les autres échouent proprement en
  // CONFLICT au lieu de ré-émettre notification/audit en double.
  const result = await prisma.sellerVerification.updateMany({
    where: { id: verificationId, status: 'PENDING_REVIEW' },
    data: {
      status: decision,
      reviewedById: adminUserId,
      reviewedAt: new Date(),
      rejectionReason: decision === 'REJECTED' ? opts?.rejectionReason ?? null : null,
      expiresAt: decision === 'APPROVED' ? opts?.expiresAt ?? new Date(Date.now() + DEFAULT_APPROVAL_VALIDITY_MS) : null,
    },
  });
  if (result.count === 0) {
    return { ok: false, error: 'Ce dossier n\'est plus en attente d\'examen (décision déjà prise).', code: 'CONFLICT' };
  }
  const updated = await prisma.sellerVerification.findUniqueOrThrow({ where: { id: verificationId } });

  void recordAudit({
    userId: adminUserId, action: `seller_verification.${decision.toLowerCase()}`, entity: 'SellerVerification', entityId: verificationId,
    metadata: { businessId: v.businessId, rejectionReason: opts?.rejectionReason, expiresAt: opts?.expiresAt },
  });

  const business = await prisma.business.findUnique({ where: { id: v.businessId }, select: { userId: true, name: true } });
  if (business) {
    void notify({
      userId: business.userId,
      category: 'BUSINESS',
      priority: 'HIGH',
      title: decision === 'APPROVED' ? 'Fournisseur vérifié ✅' : 'Vérification refusée',
      body: decision === 'APPROVED'
        ? `« ${business.name} » est désormais un fournisseur vérifié KESSIA.`
        : `Votre dossier de vérification n'a pas été accepté${opts?.rejectionReason ? ` : ${opts.rejectionReason}` : '.'}`,
      actionUrl: '/business',
    });
  }

  return { ok: true, status: updated.status };
}

/** Le badge « Fournisseur vérifié » doit-il être affiché maintenant ? */
export function isSellerVerifiedBadgeActive(v: { status: SellerVerificationStatus; expiresAt: Date | null } | null): boolean {
  if (!v || v.status !== 'APPROVED') return false;
  if (v.expiresAt && v.expiresAt.getTime() < Date.now()) return false;
  return true;
}

/**
 * Fait passer en EXPIRED les dossiers APPROVED dont l'échéance est
 * dépassée — appelable depuis un tick cron (non câblé par défaut, cette
 * fonction est prête mais aucun workflow planifié n'a été créé).
 */
export async function expireOverdueSellerVerifications(): Promise<{ expired: number }> {
  const res = await prisma.sellerVerification.updateMany({
    where: { status: 'APPROVED', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  return { expired: res.count };
}
