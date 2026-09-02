import { NextRequest } from 'next/server';
import { requireAdmin, FINANCE_ROLES } from '@/lib/auth/admin';
import prisma from '@/lib/db/prisma';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin(request, FINANCE_ROLES);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const status = searchParams.get('status');
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = 25;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { idempotencyKey: { contains: q } },
        { referenceId: { contains: q } },
        { externalReference: { contains: q } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [entries, total, agg] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { wallet: { select: { user: { select: { firstName: true, lastName: true, phone: true } } } } },
      }),
      prisma.ledgerEntry.count({ where }),
      prisma.ledgerEntry.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true }, _count: true }),
    ]);

    return ok({
      entries: entries.map((e) => ({
        id: e.id,
        type: e.type,
        direction: e.direction,
        amount: Number(e.amount),
        currency: e.currency,
        status: e.status,
        description: e.description,
        reference: e.referenceId ?? e.externalReference,
        createdAt: e.createdAt,
        user: e.wallet.user,
      })),
      totals: { completedVolume: Number(agg._sum.amount ?? 0), completedCount: agg._count },
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    logApiError('/v1/admin/transactions', e);
    return serverError();
  }
}
