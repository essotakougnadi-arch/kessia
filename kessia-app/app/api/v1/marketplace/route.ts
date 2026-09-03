// ============================================================
// KESSIA — GET/POST /api/v1/marketplace
//  GET  : catalogue public (articles ACTIVE)
//  POST : mise en vente (utilisateur connecté)
// ============================================================

import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withAuth } from '@/lib/auth/middleware';
import { createItemSchema, MARKETPLACE_CATEGORIES } from '@/lib/validations/marketplace';
import { serializeItem } from '@/lib/marketplace/serialize';
import { installmentAmount } from '@/lib/marketplace/marketplace';
import { ok, created, validationError, forbidden, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { recordAudit } from '@/lib/audit/audit.service';
import { elevateRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

const PAGE = 24;

// ---- GET : catalogue public ----

export async function GET(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, 'marketplace.list', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.trim();
    const category = url.searchParams.get('category');
    const tontineOnly = url.searchParams.get('tontine') === '1';
    const cursor = url.searchParams.get('cursor');

    const items = await prisma.marketplaceItem.findMany({
      where: {
        status: 'ACTIVE',
        stock: { gt: 0 },
        ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {}),
        ...(category && (MARKETPLACE_CATEGORIES as readonly string[]).includes(category) ? { category } : {}),
        ...(tontineOnly ? { payableByTontine: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        seller: { select: { id: true, firstName: true, lastName: true } },
        business: { select: { id: true, name: true } },
      },
    });

    const hasMore = items.length > PAGE;
    const page = items.slice(0, PAGE);

    return ok({
      items: page.map((it) => serializeItem(it, { includeImage: true })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    logApiError('/v1/marketplace', error);
    return serverError();
  }
}

// ---- POST : mise en vente ----

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const limited = await enforceRateLimit(request, 'marketplace.create', {
      limit: 20, windowMs: 60 * 60_000, by: context.userId,
    });
    if (limited) return limited;

    const parsed = createItemSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;

    if (d.businessId) {
      const biz = await prisma.business.findFirst({
        where: { id: d.businessId, userId: context.userId },
        select: { id: true },
      });
      if (!biz) return forbidden('Cette entreprise ne vous appartient pas.');
    }

    const installments = d.payableByTontine ? (d.tontineInstallments ?? 6) : null;

    const item = await prisma.marketplaceItem.create({
      data: {
        sellerId: context.userId,
        businessId: d.businessId ?? null,
        title: d.title,
        description: d.description ?? null,
        category: d.category ?? null,
        price: d.price,
        city: d.city ?? null,
        imageUrl: d.imageUrl ?? null,
        payableByTontine: d.payableByTontine,
        tontineInstallments: installments,
        stock: d.stock,
      },
      include: {
        seller: { select: { id: true, firstName: true, lastName: true } },
        business: { select: { id: true, name: true } },
      },
    });

    void elevateRole(context.userId, 'BUSINESS_OWNER');
    void recordAudit({
      userId: context.userId, action: 'marketplace.item.create', entity: 'MarketplaceItem', entityId: item.id, request,
    });

    return created(
      {
        ...serializeItem(item, { includeImage: false }),
        tontineInstallmentAmount: installments ? installmentAmount(d.price, installments) : null,
      },
      'Article mis en vente.'
    );
  } catch (error) {
    logApiError('/v1/marketplace', error);
    return serverError();
  }
}
