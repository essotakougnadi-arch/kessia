// ============================================================
// KESSIA — GET/PUT/POST /api/v1/business/[id]/plan  (§17)
//   GET   → plan stocké, ou brouillon généré et enregistré
//   PUT   → enregistre le contenu édité
//   POST  { action: 'regenerate' } → régénère un brouillon
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { requireBusinessOwner } from '@/lib/business/access';
import { generateBusinessPlanDraft, isBusinessPlanContent, type BusinessPlanContent } from '@/lib/business/plan';
import { recordAudit } from '@/lib/audit/audit.service';
import { ok, badRequest, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const contentSchema = z.object({
  resume: z.string().max(4000),
  clienteleCible: z.string().max(4000),
  offre: z.string().max(4000),
  differenciation: z.string().max(4000),
  canaux: z.string().max(4000),
  structureCouts: z.string().max(4000),
  previsionnel: z.string().max(4000),
  risques: z.string().max(4000),
  prochainesActions: z.array(z.string().max(500)).max(12),
});

async function payload(businessId: string) {
  const plan = await prisma.businessPlan.findUnique({ where: { businessId } });
  return plan
    ? { content: plan.content as unknown as BusinessPlanContent, generatedAt: plan.generatedAt, updatedAt: plan.updatedAt, exists: true }
    : null;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const existing = await payload(params.id);
    if (existing) return ok(existing);

    const draft = await generateBusinessPlanDraft(params.id);
    if (!draft) return badRequest('Impossible de générer le plan : activité introuvable.');
    const plan = await prisma.businessPlan.create({
      data: { businessId: params.id, content: draft as unknown as object },
    });
    return ok({ content: draft, generatedAt: plan.generatedAt, updatedAt: plan.updatedAt, exists: true });
  } catch (e) {
    logApiError('/v1/business/[id]/plan', e);
    return serverError();
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const parsed = contentSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    if (!isBusinessPlanContent(parsed.data)) return badRequest('Contenu de plan invalide.');

    const plan = await prisma.businessPlan.upsert({
      where: { businessId: params.id },
      create: { businessId: params.id, content: parsed.data as unknown as object },
      update: { content: parsed.data as unknown as object },
    });
    void recordAudit({
      userId: auth.userId, action: 'business.plan_updated', entity: 'BusinessPlan', entityId: plan.id,
      metadata: { businessId: params.id }, request,
    });
    return ok({ updatedAt: plan.updatedAt }, 'Plan enregistré.');
  } catch (e) {
    logApiError('/v1/business/[id]/plan', e);
    return serverError();
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBusinessOwner(request, params.id);
    if ('error' in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    if (body?.action !== 'regenerate') return badRequest('Action inconnue.');

    const draft = await generateBusinessPlanDraft(params.id);
    if (!draft) return badRequest('Impossible de générer le plan.');
    const plan = await prisma.businessPlan.upsert({
      where: { businessId: params.id },
      create: { businessId: params.id, content: draft as unknown as object },
      update: { content: draft as unknown as object, generatedAt: new Date() },
    });
    void recordAudit({
      userId: auth.userId, action: 'business.plan_regenerated', entity: 'BusinessPlan', entityId: plan.id,
      metadata: { businessId: params.id }, request,
    });
    return ok({ content: draft, generatedAt: plan.generatedAt, updatedAt: plan.updatedAt, exists: true }, 'Brouillon régénéré.');
  } catch (e) {
    logApiError('/v1/business/[id]/plan', e);
    return serverError();
  }
}
