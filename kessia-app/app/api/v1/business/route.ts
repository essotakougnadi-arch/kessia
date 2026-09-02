// ============================================================
// KESSIA — GET/POST /api/v1/business
// Liste des businesses + Créer un business
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, created, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { recordAudit } from '@/lib/audit/audit.service';
import { elevateRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

const createBusinessSchema = z.object({
  name: z.string().min(2, 'Nom trop court').max(100, 'Nom trop long'),
  sector: z.string().min(2, 'Secteur requis').max(100),
  description: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
});

// ---- GET ----

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const businesses = await prisma.business.findMany({
      where: { userId: context.userId, status: { not: 'SUSPENDED' } },
      include: {
        _count: {
          select: { products: true, sales: true, customers: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return ok(businesses);
  } catch (error) {
    logApiError('/v1/business', error);
    return serverError();
  }
}

// ---- POST ----

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const body = await request.json();
    const parsed = createBusinessSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const business = await prisma.business.create({
      data: {
        ...parsed.data,
        userId: context.userId,
      },
    });

    void recordAudit({
      userId: context.userId, action: 'business.create', entity: 'Business', entityId: business.id,
      metadata: { name: business.name, sector: business.sector }, request,
    });
    // Élévation de rôle : l'utilisateur devient chef d'entreprise (§4)
    void elevateRole(context.userId, 'BUSINESS_OWNER');

    return created(business, `Business "${business.name}" créé avec succès.`);
  } catch (error) {
    logApiError('/v1/business', error);
    return serverError();
  }
}
