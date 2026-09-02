import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import prisma from '@/lib/db/prisma';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const kyc = searchParams.get('kyc');
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = 20;

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (kyc) where.kycStatus = kyc;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, firstName: true, lastName: true, phone: true, email: true,
          role: true, kycStatus: true, kycLevel: true, isActive: true,
          createdAt: true, lastLoginAt: true,
          wallet: { select: { balance: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return ok({
      users: users.map((u) => ({
        ...u,
        balance: u.wallet ? Number(u.wallet.balance) : 0,
        wallet: undefined,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    logApiError('/v1/admin/users', e);
    return serverError();
  }
}
