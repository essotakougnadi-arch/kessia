// ============================================================
// KESSIA — GET/POST/DELETE /api/v1/modules/interest  (§9–§16)
// Captation d'intérêt pour les modules Phase 8.
// ============================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { withAuth } from '@/lib/auth/middleware';
import { INTEREST_KEYS } from '@/lib/modules/catalog';
import { ok, created, badRequest, validationError, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const schema = z.object({ module: z.string().min(1).max(40) });

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;
    const rows = await prisma.moduleInterest.findMany({
      where: { userId: context.userId }, select: { module: true },
    });
    return ok({ modules: rows.map((r) => r.module) });
  } catch (e) {
    logApiError('/v1/modules/interest', e);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    if (!INTEREST_KEYS.includes(parsed.data.module)) return badRequest('Module inconnu.');

    await prisma.moduleInterest.upsert({
      where: { userId_module: { userId: context.userId, module: parsed.data.module } },
      create: { userId: context.userId, module: parsed.data.module },
      update: {},
    });
    return created({ module: parsed.data.module }, 'Merci ! Nous vous préviendrons dès l’ouverture.');
  } catch (e) {
    logApiError('/v1/modules/interest', e);
    return serverError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;
    const moduleKey = new URL(request.url).searchParams.get('module');
    if (!moduleKey) return badRequest('module requis.');
    await prisma.moduleInterest.deleteMany({ where: { userId: context.userId, module: moduleKey } });
    return ok(null, 'Retiré.');
  } catch (e) {
    logApiError('/v1/modules/interest', e);
    return serverError();
  }
}
