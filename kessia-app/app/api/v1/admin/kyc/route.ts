import { NextRequest } from 'next/server';
import { requireAdmin, COMPLIANCE_ROLES } from '@/lib/auth/admin';
import prisma from '@/lib/db/prisma';
import { ok, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireAdmin(request, COMPLIANCE_ROLES);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'UNDER_REVIEW';

    const cases = await prisma.kycCase.findMany({
      where: status === 'ALL' ? {} : { status: status as never },
      orderBy: { submittedAt: 'asc' },
      take: 50,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        documents: { select: { id: true, type: true, status: true, uploadedAt: true } },
      },
    });

    return ok(
      cases.map((c) => ({
        id: c.id,
        status: c.status,
        level: c.level,
        rejectionReason: c.rejectionReason,
        submittedAt: c.submittedAt,
        createdAt: c.createdAt,
        user: c.user,
        documents: c.documents,
      }))
    );
  } catch (e) {
    logApiError('/v1/admin/kyc', e);
    return serverError();
  }
}
